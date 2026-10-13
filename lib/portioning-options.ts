import Decimal from "decimal.js";
import { loadOrgRecipeGraph, getRecipeUsagePerUnit, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, removeYieldFactor, type UnitValue } from "@/lib/units";

export type PortionOption = {
  recipeId: string;
  recipeName: string;
  /** Producto a granel del que sale esta porcion. */
  productId: string;
  /** Cuanto de ese producto lleva UNA porcion, en la unidad base del producto. */
  baseQtyPerPortion: string;
  /** Costo de los demas ingredientes de la porcion (otro simple, una subreceta). */
  extraCostPerPortion: string;
  /** Unidad en la que se cuentan las porciones (el rendimiento de la receta: PZA, normalmente). */
  portionUnitLabel: string;
};

export type PortionableProduct = {
  id: string;
  name: string;
  baseUnitLabel: string;
  baseUnit: UnitValue;
  /** Costo por unidad APROVECHABLE: ya trae aplicado el rendimiento del producto. */
  currentUnitCost: string;
  /** Costo por unidad COMPRADA, sin el rendimiento. Es lo que de verdad costo lo que entro. */
  grossUnitCost: string;
  yieldPercentage: string;
};

/**
 * Que se puede porcionar y con que recetas.
 *
 * La lista de productos NO es el catalogo completo: solo los productos que aparecen como
 * ingrediente de alguna receta marcada como porcion. Si CAMARON no esta en ninguna receta de
 * porcion, no tiene caso ofrecerlo aqui.
 *
 * Para cada pareja producto-receta se resuelve cuanto producto lleva una porcion (del
 * ingrediente, no del rendimiento) y cuanto cuestan los demas ingredientes de esa porcion.
 */
export async function loadPortioningOptions(
  sucursalId: string,
  products: { id: string; name: string; baseUnit: string; currentUnitCost: unknown; yieldPercentage: unknown }[],
): Promise<{ products: PortionableProduct[]; options: PortionOption[] }> {
  const graph = await loadOrgRecipeGraph(sucursalId);
  const productById = new Map(products.map((p) => [p.id, p]));

  const options: PortionOption[] = [];
  const usedProductIds = new Set<string>();

  for (const [recipeId, recipe] of graph.recipes) {
    if (!recipe.isPortion) continue; // el grafo ya excluye las archivadas

    let usage;
    let costoPorRendimiento: Decimal;
    try {
      usage = getRecipeUsagePerUnit(recipeId, graph);
      costoPorRendimiento = recipe.yieldQty.isZero()
        ? new Decimal(0)
        : getRecipeCost(recipeId, graph).dividedBy(recipe.yieldQty);
    } catch {
      continue; // receta con datos inconsistentes: no se ofrece en vez de tumbar la pantalla
    }

    for (const [productId, qtyPerPortion] of usage.products) {
      const product = productById.get(productId);
      if (!product || qtyPerPortion.lte(0)) continue;

      // Lo que cuesta la porcion sin contar el producto base: el otro simple o la subreceta.
      const costoDelBase = qtyPerPortion.times(new Decimal(String(product.currentUnitCost)));
      const extra = Decimal.max(costoPorRendimiento.minus(costoDelBase), 0);

      options.push({
        recipeId,
        recipeName: recipe.name,
        productId,
        baseQtyPerPortion: qtyPerPortion.toString(),
        extraCostPerPortion: extra.toString(),
        portionUnitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
      });
      usedProductIds.add(productId);
    }
  }

  const portionable: PortionableProduct[] = products
    .filter((p) => usedProductIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      baseUnit: p.baseUnit as UnitValue,
      baseUnitLabel: UNIT_LABELS[p.baseUnit as UnitValue],
      currentUnitCost: String(p.currentUnitCost),
      grossUnitCost: removeYieldFactor(String(p.currentUnitCost), String(p.yieldPercentage)).toString(),
      yieldPercentage: String(p.yieldPercentage),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { products: portionable, options };
}
