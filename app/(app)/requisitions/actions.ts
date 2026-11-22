"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { resolveDestRecipeIds } from "@/lib/requisitions/subrecipe-match";
import {
  getInternalProductPrices,
  getInternalRecipePrices,
  pegarCostoEnDestino,
} from "@/lib/internal-prices";
import { UNITS, type UnitValue } from "@/lib/units";

type RequisicionRowInput = {
  itemType?: "product" | "subrecipe";
  productId?: string;
  subRecipeId?: string;
  quantity: string;
  unit: string;
};

function parseUnit(value: unknown): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

export async function createRequisicion(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let requisicionId: string;
  try {
    const user = await requireSucursalContext();

    const toSucursalId = String(formData.get("toSucursalId") ?? "").trim();
    const dateRaw = String(formData.get("date") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;
    const rowsRaw = String(formData.get("rows") ?? "[]");

    if (!toSucursalId) throw new Error("Selecciona la sucursal destino.");
    if (toSucursalId === user.sucursalId) {
      throw new Error("La sucursal destino debe ser distinta a la sucursal de origen.");
    }
    if (!dateRaw) throw new Error("Indica la fecha de la requisicion.");

    const toSucursal = await prisma.sucursal.findFirst({
      where: { id: toSucursalId, organizationId: user.organizationId, isActive: true },
    });
    if (!toSucursal) throw new Error("Sucursal destino no encontrada.");

    let rows: RequisicionRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de requisicion invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un producto.");
    }

    const productRows = rows.filter((r) => (r.itemType ?? "product") === "product");
    const subRecipeRows = rows.filter((r) => r.itemType === "subrecipe");

    const productIds = [...new Set(productRows.map((r) => r.productId!))];
    const subRecipeIds = [...new Set(subRecipeRows.map((r) => r.subRecipeId!))];

    const [
      products,
      productCosts,
      subRecipes,
      graph,
      destRecipeIdByOrigin,
      productPrices,
      recipePrices,
    ] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds }, organizationId: user.organizationId },
      }),
      getSucursalProductCosts(user.sucursalId, productIds),
      prisma.recipe.findMany({
        where: { id: { in: subRecipeIds }, sucursalId: user.sucursalId, archivedAt: null },
      }),
      subRecipeIds.length > 0 ? loadOrgRecipeGraph(user.sucursalId) : Promise.resolve(null),
      resolveDestRecipeIds(subRecipeIds, toSucursalId),
      // El precio es el de quien envia, y se congela aqui: cambiarlo despues no mueve este
      // traspaso, igual que pasa con el costo.
      getInternalProductPrices(user.sucursalId, productIds),
      getInternalRecipePrices(user.sucursalId, subRecipeIds),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));
    const costMemo = new Map<string, Decimal>();

    const date = new Date(`${dateRaw}T00:00:00Z`);

    const productItems = productRows.map((row, index) => {
      const product = productById.get(row.productId!);
      if (!product) throw new Error(`Selecciona un producto valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad de "${product.name}" debe ser mayor a cero.`);
      }
      const unit = parseUnit(row.unit);
      const unitCost = productCosts.get(product.id) ?? new Decimal(0);

      const precio = productPrices.get(product.id) ?? null;

      return {
        productId: product.id,
        quantity: quantity.toString(),
        unit,
        unitCost: unitCost.toString(),
        unitPrice: precio ? precio.price.toString() : null,
        // La tasa se congela junto al precio: un traspaso a costo no traslada impuesto.
        ivaRate: precio ? precio.ivaRate.toString() : "0",
      };
    });

    const subRecipeItems = subRecipeRows.map((row, index) => {
      const subRecipe = subRecipeById.get(row.subRecipeId!);
      if (!subRecipe) throw new Error(`Selecciona una subreceta valida (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad de "${subRecipe.name}" debe ser mayor a cero.`);
      }
      const unit = parseUnit(row.unit);
      let unitCost = new Decimal(0);
      if (graph && !subRecipe.yieldQty.isZero()) {
        try {
          unitCost = getRecipeCost(subRecipe.id, graph, costMemo).dividedBy(subRecipe.yieldQty);
        } catch {
          unitCost = new Decimal(0);
        }
      }

      const destSubRecipeId = destRecipeIdByOrigin.get(subRecipe.id);
      if (!destSubRecipeId) {
        throw new Error(
          `La sucursal destino no tiene una subreceta equivalente a "${subRecipe.name}". Creala ahi primero (o creala desde la sucursal principal para que se clone automaticamente).`,
        );
      }

      const precio = recipePrices.get(subRecipe.id) ?? null;

      return {
        subRecipeId: subRecipe.id,
        destSubRecipeId,
        quantity: quantity.toString(),
        unit,
        unitCost: unitCost.toString(),
        unitPrice: precio ? precio.price.toString() : null,
        ivaRate: precio ? precio.ivaRate.toString() : "0",
      };
    });

    const items = [...productItems, ...subRecipeItems];
    if (items.length === 0) throw new Error("Agrega al menos un producto o subreceta.");

    const requisicion = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextRequisicionFolio: { increment: 1 } },
        select: { nextRequisicionFolio: true },
      });
      const folio = org.nextRequisicionFolio - 1;
      const creada = await tx.requisicion.create({
        data: {
          organizationId: user.organizationId,
          folio,
          fromSucursalId: user.sucursalId,
          toSucursalId,
          date,
          note,
          createdByUserId: user.id,
          items: { create: items },
        },
      });
      // Lo que entra a la sucursal destino le queda costando el precio al que se lo vendieron,
      // no lo que le costaba a quien lo mando. Va dentro de la misma transaccion: si el traspaso
      // no se guarda, el costo tampoco se movio.
      await pegarCostoEnDestino(tx, toSucursalId, items);
      return creada;
    });
    requisicionId = requisicion.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la requisicion." };
  }

  revalidatePath("/requisitions");
  revalidatePath("/audit");
  revalidatePath("/dashboard");
  redirect(`/requisitions/${requisicionId}`);
}

/**
 * Alcance de sucursales del usuario: todas las de la organizacion si no es STAFF, y solo las
 * asignadas si lo es. Es el mismo criterio con el que la lista decide que requisiciones muestra.
 */
async function sucursalesAlcanzables(user: {
  role: string;
  organizationId: string;
  sucursalIds: string[];
}): Promise<Set<string>> {
  if (user.role !== "STAFF") {
    const todas = await prisma.sucursal.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    });
    return new Set(todas.map((s) => s.id));
  }
  return new Set(user.sucursalIds);
}

/**
 * Borra una requisicion completa.
 *
 * No hace falta ningun asiento de correccion: la Auditoria y el Kardex leen las requisiciones
 * en vivo de la tabla, asi que al desaparecer el renglon el movimiento de inventario se deshace
 * solo en las dos sucursales. Los RequisicionItem se van en cascada.
 *
 * Solo puede borrarla quien alcanza la sucursal de ORIGEN: quien recibe no deberia poder
 * desaparecer un envio que registro alguien mas.
 */
export async function deleteRequisicion(id: string): Promise<{ error?: string }> {
  const user = await requireSucursalContext();

  const requisicion = await prisma.requisicion.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, fromSucursalId: true, toSucursalId: true },
  });
  if (!requisicion) return { error: "Requisicion no encontrada." };

  const alcance = await sucursalesAlcanzables(user);
  if (!alcance.has(requisicion.fromSucursalId)) {
    return { error: "Solo la sucursal que envio la requisicion puede borrarla." };
  }

  await prisma.requisicion.delete({ where: { id: requisicion.id } });

  revalidatePath("/requisitions");
  revalidatePath("/audit");
  revalidatePath("/kardex");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return {};
}

/** Cambia la nota de una requisicion ya registrada. Vacia la deja en null. */
export async function updateRequisicionNote(
  id: string,
  note: string,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();

  const requisicion = await prisma.requisicion.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, fromSucursalId: true, toSucursalId: true },
  });
  if (!requisicion) return { error: "Requisicion no encontrada." };

  const alcance = await sucursalesAlcanzables(user);
  if (!alcance.has(requisicion.fromSucursalId) && !alcance.has(requisicion.toSucursalId)) {
    return { error: "No tienes acceso a esta requisicion." };
  }

  await prisma.requisicion.update({
    where: { id: requisicion.id },
    data: { note: note.trim().slice(0, 1000) || null },
  });

  revalidatePath("/requisitions");
  revalidatePath(`/requisitions/${requisicion.id}`);
  return {};
}
