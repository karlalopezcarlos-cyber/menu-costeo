"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts } from "@/lib/costing";
import { UNITS, type UnitValue } from "@/lib/units";

type RequisicionRowInput = {
  productId: string;
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

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const [products, productCosts] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds }, organizationId: user.organizationId },
      }),
      getSucursalProductCosts(user.sucursalId, productIds),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));

    const date = new Date(`${dateRaw}T00:00:00Z`);

    const items = rows.map((row, index) => {
      const product = productById.get(row.productId);
      if (!product) throw new Error(`Selecciona un producto valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad de "${product.name}" debe ser mayor a cero.`);
      }
      const unit = parseUnit(row.unit);
      const unitCost = productCosts.get(product.id) ?? new Decimal(0);

      return {
        productId: product.id,
        quantity: quantity.toString(),
        unit,
        unitCost: unitCost.toString(),
      };
    });

    const requisicion = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextRequisicionFolio: { increment: 1 } },
        select: { nextRequisicionFolio: true },
      });
      const folio = org.nextRequisicionFolio - 1;
      return tx.requisicion.create({
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
