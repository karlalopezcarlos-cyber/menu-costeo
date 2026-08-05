"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost, getSucursalProductCosts, type RecipeGraph } from "@/lib/costing";
import { removeYieldFactor } from "@/lib/units";

async function getCount(countId: string, sucursalId: string) {
  const count = await prisma.inventoryCount.findFirst({ where: { id: countId, sucursalId } });
  if (!count) throw new Error("Conteo de inventario no encontrado.");
  return count;
}

function subRecipeUnitCost(graph: RecipeGraph, memo: Map<string, Decimal>, recipeId: string): Decimal {
  const node = graph.recipes.get(recipeId);
  if (!node || node.yieldQty.isZero()) return new Decimal(0);
  return getRecipeCost(recipeId, graph, memo).dividedBy(node.yieldQty);
}

export type InventoryCaptureEntry = {
  type: "product" | "subrecipe";
  id: string;
  quantity: string;
  costBasis?: string;
};

/**
 * Logica compartida por el guardado manual (boton "Guardar conteo") y el autoguardado en
 * segundo plano: recibe la lista completa de renglones capturados y hace upsert/delete de cada
 * InventoryCountItem segun corresponda. Cantidad vacia o 0 borra el renglon (si existia); cantidad
 * > 0 crea/actualiza con el costo unitario vigente segun la base elegida (solo aplica a productos
 * con rendimiento < 100%, ej. "gross" = costo de compra del aguacate entero sin pelar).
 */
async function persistInventoryCount(
  countId: string,
  organizationId: string,
  sucursalId: string,
  userId: string | null,
  entries: InventoryCaptureEntry[],
) {
  const count = await getCount(countId, sucursalId);

  const [products, subRecipes, graph, existingItems] = await Promise.all([
    prisma.product.findMany({ where: { organizationId, archivedAt: null } }),
    prisma.recipe.findMany({ where: { sucursalId, archivedAt: null, isMenuItem: false } }),
    loadOrgRecipeGraph(sucursalId),
    prisma.inventoryCountItem.findMany({ where: { inventoryCountId: count.id } }),
  ]);
  const productCosts = await getSucursalProductCosts(
    sucursalId,
    products.map((p) => p.id),
  );
  const productById = new Map(products.map((p) => [p.id, p]));
  const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));
  const existingByProductId = new Map(
    existingItems.filter((i) => i.productId).map((i) => [i.productId as string, i]),
  );
  const existingBySubRecipeId = new Map(
    existingItems.filter((i) => i.subRecipeId).map((i) => [i.subRecipeId as string, i]),
  );
  const memo = new Map<string, Decimal>();

  const toUpsertProduct: { id: string; quantity: string; costBasis: string }[] = [];
  const toUpsertSubRecipe: { id: string; quantity: string }[] = [];
  const toDeleteProductIds: string[] = [];
  const toDeleteSubRecipeIds: string[] = [];
  const changeLogs: {
    productId: string | null;
    subRecipeId: string | null;
    previousQuantity: string | null;
    newQuantity: string;
  }[] = [];

  for (const entry of entries) {
    const raw = entry.quantity.trim();
    let quantity: Decimal;
    try {
      quantity = new Decimal(raw || "0");
    } catch {
      continue;
    }

    if (entry.type === "product" && productById.has(entry.id)) {
      const existing = existingByProductId.get(entry.id);
      if (quantity.lte(0)) {
        if (existing) {
          toDeleteProductIds.push(entry.id);
          changeLogs.push({
            productId: entry.id,
            subRecipeId: null,
            previousQuantity: existing.quantity.toString(),
            newQuantity: "0",
          });
        }
      } else {
        const costBasis = entry.costBasis === "gross" ? "gross" : "net";
        toUpsertProduct.push({ id: entry.id, quantity: quantity.toString(), costBasis });
        if (!existing || !existing.quantity.equals(quantity)) {
          changeLogs.push({
            productId: entry.id,
            subRecipeId: null,
            previousQuantity: existing ? existing.quantity.toString() : null,
            newQuantity: quantity.toString(),
          });
        }
      }
    } else if (entry.type === "subrecipe" && subRecipeById.has(entry.id)) {
      const existing = existingBySubRecipeId.get(entry.id);
      if (quantity.lte(0)) {
        if (existing) {
          toDeleteSubRecipeIds.push(entry.id);
          changeLogs.push({
            productId: null,
            subRecipeId: entry.id,
            previousQuantity: existing.quantity.toString(),
            newQuantity: "0",
          });
        }
      } else {
        toUpsertSubRecipe.push({ id: entry.id, quantity: quantity.toString() });
        if (!existing || !existing.quantity.equals(quantity)) {
          changeLogs.push({
            productId: null,
            subRecipeId: entry.id,
            previousQuantity: existing ? existing.quantity.toString() : null,
            newQuantity: quantity.toString(),
          });
        }
      }
    }
  }

  await prisma.$transaction([
    ...toUpsertProduct.map(({ id, quantity, costBasis }) => {
      const product = productById.get(id)!;
      const netCost = productCosts.get(id) ?? new Decimal(0);
      const unitCost =
        costBasis === "gross" ? removeYieldFactor(netCost, product.yieldPercentage) : netCost;
      return prisma.inventoryCountItem.upsert({
        where: { inventoryCountId_productId: { inventoryCountId: count.id, productId: id } },
        create: {
          inventoryCountId: count.id,
          productId: id,
          quantity,
          unit: product.baseUnit,
          unitCost: unitCost.toString(),
          costBasis,
        },
        update: { quantity, unit: product.baseUnit, unitCost: unitCost.toString(), costBasis },
      });
    }),
    ...toUpsertSubRecipe.map(({ id, quantity }) => {
      const subRecipe = subRecipeById.get(id)!;
      const unitCost = subRecipeUnitCost(graph, memo, id);
      return prisma.inventoryCountItem.upsert({
        where: { inventoryCountId_subRecipeId: { inventoryCountId: count.id, subRecipeId: id } },
        create: {
          inventoryCountId: count.id,
          subRecipeId: id,
          quantity,
          unit: subRecipe.yieldUnit,
          unitCost: unitCost.toString(),
        },
        update: { quantity, unit: subRecipe.yieldUnit, unitCost: unitCost.toString() },
      });
    }),
    ...(toDeleteProductIds.length
      ? [
          prisma.inventoryCountItem.deleteMany({
            where: { inventoryCountId: count.id, productId: { in: toDeleteProductIds } },
          }),
        ]
      : []),
    ...(toDeleteSubRecipeIds.length
      ? [
          prisma.inventoryCountItem.deleteMany({
            where: { inventoryCountId: count.id, subRecipeId: { in: toDeleteSubRecipeIds } },
          }),
        ]
      : []),
    ...changeLogs.map((log) =>
      prisma.inventoryCountItemChange.create({
        data: {
          organizationId,
          sucursalId,
          inventoryCountId: count.id,
          productId: log.productId,
          subRecipeId: log.subRecipeId,
          previousQuantity: log.previousQuantity,
          newQuantity: log.newQuantity,
          changedByUserId: userId,
        },
      }),
    ),
  ]);
}

export async function saveInventoryCount(countId: string, formData: FormData) {
  const user = await requireSucursalContext();

  const basisByProductId = new Map<string, string>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("basis:product:")) continue;
    const id = key.slice("basis:product:".length);
    basisByProductId.set(id, String(rawValue));
  }

  const entries: InventoryCaptureEntry[] = [];
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("qty:")) continue;
    const [, type, id] = key.split(":");
    if (type !== "product" && type !== "subrecipe") continue;
    entries.push({ type, id, quantity: String(rawValue), costBasis: basisByProductId.get(id) });
  }

  await persistInventoryCount(countId, user.organizationId, user.sucursalId, user.id, entries);

  revalidatePath(`/inventory/${countId}`);
  revalidatePath("/inventory");
}

/**
 * Autoguardado silencioso en segundo plano (sin redirect ni revalidatePath, para no interrumpir
 * la captura en curso): protege contra perder la captura si se va la luz o se cierra el navegador
 * antes de dar click en "Guardar conteo".
 */
export async function autoSaveInventoryCount(
  countId: string,
  entries: InventoryCaptureEntry[],
): Promise<{ savedAt: string } | { error: string }> {
  try {
    const user = await requireSucursalContext();
    await persistInventoryCount(countId, user.organizationId, user.sucursalId, user.id, entries);
    return { savedAt: new Date().toISOString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo autoguardar." };
  }
}
