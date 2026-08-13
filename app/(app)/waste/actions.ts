"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { convertQty, removeYieldFactor, UNIT_META, UNITS, type UnitValue } from "@/lib/units";

type WasteRowInput = {
  itemType?: "product" | "subrecipe";
  productId?: string;
  subRecipeId?: string;
  quantity: string;
  unit?: string;
  comment: string;
  costBasis?: string;
};

export async function createWasteEntries(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();

    const wasteDateRaw = String(formData.get("wasteDate") ?? "");
    const rowsRaw = String(formData.get("rows") ?? "[]");

    if (!wasteDateRaw) throw new Error("Indica la fecha de la merma.");

    let rows: WasteRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de merma invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un producto, subreceta o PLU.");
    }

    const productRows = rows.filter((r) => (r.itemType ?? "product") === "product");
    const subRecipeRows = rows.filter((r) => r.itemType === "subrecipe");

    const productIds = [...new Set(productRows.map((r) => r.productId!))];
    const subRecipeIds = [...new Set(subRecipeRows.map((r) => r.subRecipeId!))];

    const [products, productCosts, subRecipes, graph] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds }, organizationId: user.organizationId },
      }),
      getSucursalProductCosts(user.sucursalId, productIds),
      prisma.recipe.findMany({
        where: { id: { in: subRecipeIds }, sucursalId: user.sucursalId, archivedAt: null },
      }),
      subRecipeIds.length > 0 ? loadOrgRecipeGraph(user.sucursalId) : Promise.resolve(null),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));
    const costMemo = new Map<string, Decimal>();

    const wasteDate = new Date(wasteDateRaw);

    const productItems = productRows.map((row, index) => {
      const product = productById.get(row.productId!);
      if (!product) throw new Error(`Selecciona un producto valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad mermada de "${product.name}" debe ser mayor a cero.`);
      }

      const unit = (UNITS as readonly string[]).includes(row.unit ?? "")
        ? (row.unit as UnitValue)
        : (product.baseUnit as UnitValue);
      if (UNIT_META[unit].type !== UNIT_META[product.baseUnit as UnitValue].type) {
        throw new Error(`La unidad no es compatible con "${product.name}".`);
      }

      const costBasis = row.costBasis === "gross" ? "gross" : "net";
      const yieldPercentage = Number(product.yieldPercentage);
      const netCost = productCosts.get(product.id) ?? new Decimal(0);
      const baseUnitCost =
        costBasis === "gross" && yieldPercentage !== 100
          ? removeYieldFactor(netCost, product.yieldPercentage)
          : netCost;
      const unitCost = convertQty(1, unit, product.baseUnit as UnitValue).times(baseUnitCost);

      return {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        productId: product.id,
        date: wasteDate,
        quantity: quantity.toString(),
        unit,
        unitCost: unitCost.toString(),
        costBasis,
        comment: row.comment.trim() || null,
        createdByUserId: user.id,
      };
    });

    const subRecipeItems = subRecipeRows.map((row, index) => {
      const subRecipe = subRecipeById.get(row.subRecipeId!);
      if (!subRecipe) throw new Error(`Selecciona una subreceta o PLU valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad mermada de "${subRecipe.name}" debe ser mayor a cero.`);
      }

      let unitCost = new Decimal(0);
      if (graph && !subRecipe.yieldQty.isZero()) {
        try {
          unitCost = getRecipeCost(subRecipe.id, graph, costMemo).dividedBy(subRecipe.yieldQty);
        } catch {
          unitCost = new Decimal(0);
        }
      }

      return {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        subRecipeId: subRecipe.id,
        date: wasteDate,
        quantity: quantity.toString(),
        unit: subRecipe.yieldUnit,
        unitCost: unitCost.toString(),
        comment: row.comment.trim() || null,
        createdByUserId: user.id,
      };
    });

    const toCreate = [...productItems, ...subRecipeItems];
    if (toCreate.length === 0) throw new Error("Agrega al menos un producto, subreceta o PLU.");

    await prisma.wasteEntry.createMany({ data: toCreate });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la merma." };
  }

  revalidatePath("/waste");
  revalidatePath("/audit");
  revalidatePath("/dashboard");
  redirect("/waste");
}

export async function deleteWasteEntry(id: string): Promise<void> {
  const user = await requireSucursalContext();

  const entry = await prisma.wasteEntry.findFirst({ where: { id, sucursalId: user.sucursalId } });
  if (!entry) throw new Error("Merma no encontrada.");

  await prisma.wasteEntry.delete({ where: { id: entry.id } });

  revalidatePath("/waste");
  revalidatePath("/audit");
  revalidatePath("/dashboard");
}
