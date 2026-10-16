import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, removeYieldFactor, type UnitValue } from "@/lib/units";
import type { TransformationProduct } from "@/lib/transformations";

export type { TransformationProduct };

/**
 * Catalogo para la pantalla de transformaciones: cualquier producto puede entrar y cualquiera
 * puede salir.
 *
 * Eso es deliberado. Antes la receta de la porcion decidia de que producto tenia que salir, y
 * eso obligaba a limpiar antes de porcionar aunque ese dia se hubiera porcionado el crudo
 * directo. Aqui se elige en el momento: de CAMARON o de CAMARON LIMPIO, segun lo que se haya
 * hecho de verdad.
 */
export async function loadTransformationProducts(
  organizationId: string,
  sucursalId: string,
): Promise<TransformationProduct[]> {
  const products = await prisma.product.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    include: { extrasRecipe: { select: { id: true, name: true } } },
  });

  // El costo de los agregados se saca de las recetas, no se captura a mano: si sube la bolsa,
  // la siguiente transformacion ya lo trae.
  const necesitaGrafo = products.some((p) => p.extrasRecipeId);
  const graph = necesitaGrafo ? await loadOrgRecipeGraph(sucursalId) : null;

  function extraCost(recipeId: string | null): Decimal {
    if (!recipeId || !graph) return new Decimal(0);
    const recipe = graph.recipes.get(recipeId);
    if (!recipe || recipe.yieldQty.isZero()) return new Decimal(0);
    try {
      return getRecipeCost(recipeId, graph).dividedBy(recipe.yieldQty);
    } catch {
      return new Decimal(0);
    }
  }

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    baseUnit: product.baseUnit as UnitValue,
    baseUnitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
    isProcessed: product.isProcessed,
    currentUnitCost: product.currentUnitCost.toString(),
    grossUnitCost: removeYieldFactor(
      product.currentUnitCost.toString(),
      product.yieldPercentage.toString(),
    ).toString(),
    yieldPercentage: product.yieldPercentage.toString(),
    portionQty: product.portionQty ? product.portionQty.toString() : null,
    portionUnit: product.portionUnit ? (product.portionUnit as UnitValue) : null,
    defaultSourceProductId: product.defaultSourceProductId,
    extraCostPerUnit: extraCost(product.extrasRecipeId).toDecimalPlaces(6).toString(),
    extrasRecipeName: product.extrasRecipe?.name ?? null,
  }));
}
