import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";

export type MenuEngineeringClassification = "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG";
export type IvaMode = "con" | "sin";

export const CLASSIFICATION_LABELS: Record<MenuEngineeringClassification, string> = {
  STAR: "Estrella",
  PLOWHORSE: "Caballo de batalla",
  PUZZLE: "Acertijo",
  DOG: "Perro",
};

/** Tasa de IVA. El precio de venta ya incluye IVA; la base sin IVA es precio / (1 + IVA_RATE). */
const IVA_RATE = 0.16;

export type MenuEngineeringRow = {
  recipeId: string;
  recipeName: string;
  quantitySold: Decimal;
  grossUnitPrice: Decimal;
  unitPrice: Decimal;
  cost: Decimal;
  margin: Decimal;
  costPct: Decimal | null;
  popularity: Decimal;
  classification: MenuEngineeringClassification;
  costUnreliable: boolean;
};

/** Umbral clasico de Kasavana & Smith: 70% de la popularidad promedio (1/N por platillo). */
const POPULARITY_THRESHOLD_FACTOR = 0.7;

export async function computeMenuEngineeringReport(
  sucursalId: string,
  fromDate: Date,
  toDate: Date,
  ivaMode: IvaMode = "con",
): Promise<MenuEngineeringRow[]> {
  const sales = await prisma.dailySale.findMany({
    where: { sucursalId, date: { gte: fromDate, lte: toDate } },
    include: { recipe: true },
  });

  if (sales.length === 0) return [];

  // Puede haber varias filas por receta (una por dia) dentro del periodo; se agrupan sumando
  // la cantidad y usando un precio promedio ponderado por cantidad.
  const byRecipe = new Map<string, { recipeName: string; quantitySold: Decimal; weightedPriceSum: Decimal }>();
  for (const sale of sales) {
    const qty = new Decimal(sale.quantitySold);
    const existing = byRecipe.get(sale.recipeId);
    if (existing) {
      existing.quantitySold = existing.quantitySold.plus(qty);
      existing.weightedPriceSum = existing.weightedPriceSum.plus(qty.times(sale.unitPrice));
    } else {
      byRecipe.set(sale.recipeId, {
        recipeName: sale.recipe.name,
        quantitySold: qty,
        weightedPriceSum: qty.times(sale.unitPrice),
      });
    }
  }

  const graph = await loadOrgRecipeGraph(sucursalId);
  const memo = new Map<string, Decimal>();

  const totalQty = [...byRecipe.values()].reduce((sum, r) => sum.plus(r.quantitySold), new Decimal(0));

  const partial = [...byRecipe.entries()].map(([recipeId, agg]) => {
    let cost = new Decimal(0);
    let costUnreliable = false;
    try {
      cost = getRecipeCost(recipeId, graph, memo);
      if (cost.isZero()) costUnreliable = true;
    } catch {
      costUnreliable = true;
    }

    const quantitySold = agg.quantitySold;
    const grossUnitPrice = quantitySold.isZero() ? new Decimal(0) : agg.weightedPriceSum.dividedBy(quantitySold);
    const unitPrice = ivaMode === "sin" ? grossUnitPrice.dividedBy(1 + IVA_RATE) : grossUnitPrice;
    const margin = unitPrice.minus(cost);
    const costPct = unitPrice.isZero() ? null : cost.dividedBy(unitPrice).times(100);
    const popularity = totalQty.isZero() ? new Decimal(0) : quantitySold.dividedBy(totalQty);

    return {
      recipeId,
      recipeName: agg.recipeName,
      quantitySold,
      grossUnitPrice,
      unitPrice,
      cost,
      margin,
      costPct,
      popularity,
      costUnreliable,
    };
  });

  const weightedMarginSum = partial.reduce(
    (sum, row) => sum.plus(row.margin.times(row.quantitySold)),
    new Decimal(0),
  );
  const averageMargin = totalQty.isZero() ? new Decimal(0) : weightedMarginSum.dividedBy(totalQty);
  const popularityThreshold = new Decimal(1).dividedBy(partial.length).times(POPULARITY_THRESHOLD_FACTOR);

  return partial.map((row) => {
    const highMargin = row.margin.gte(averageMargin);
    const highPopularity = row.popularity.gte(popularityThreshold);

    let classification: MenuEngineeringClassification;
    if (highMargin && highPopularity) classification = "STAR";
    else if (!highMargin && highPopularity) classification = "PLOWHORSE";
    else if (highMargin && !highPopularity) classification = "PUZZLE";
    else classification = "DOG";

    return { ...row, classification };
  });
}
