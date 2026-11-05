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

/**
 * La tasa de IVA de ventas de la organizacion dueña de esta sucursal, en por ciento.
 *
 * Estaba escrita a mano como 0.16 aqui y en la tabla de ventas. Desde que la tasa es
 * configurable (Configuracion > Impuestos) eso significaba que cambiarla movia el Estado de
 * Resultados y dejaba a Ingenieria de menu diciendo otra cosa, sin que nada avisara.
 */
export async function loadSalesIvaRate(sucursalId: string): Promise<number> {
  const sucursal = await prisma.sucursal.findFirstOrThrow({
    where: { id: sucursalId },
    select: { organization: { select: { salesIvaRate: true } } },
  });
  return Number(sucursal.organization.salesIvaRate);
}

export type MenuEngineeringRow = {
  recipeId: string;
  recipeName: string;
  quantitySold: Decimal;
  grossUnitPrice: Decimal;
  unitPrice: Decimal;
  cost: Decimal;
  /** Lo que costo el platillo en todo el periodo: costo unitario x cantidad vendida. */
  totalCost: Decimal;
  /** Lo que deja UNA pieza: precio - costo. Es lo que clasifica el platillo. */
  margin: Decimal;
  /** Lo que dejo el platillo en todo el periodo: margen unitario x cantidad vendida. */
  totalMargin: Decimal;
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
  const ivaRate = ivaMode === "sin" ? await loadSalesIvaRate(sucursalId) : 0;
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
    const unitPrice =
      ivaMode === "sin" ? grossUnitPrice.dividedBy(1 + ivaRate / 100) : grossUnitPrice;
    const margin = unitPrice.minus(cost);
    // Un margen unitario alto no es dinero hasta que se multiplica por lo que se vendio: un
    // platillo de $150 de margen que sale 3 veces al mes deja menos que uno de $28 que sale 345.
    const totalMargin = margin.times(quantitySold);
    const totalCost = cost.times(quantitySold);
    const costPct = unitPrice.isZero() ? null : cost.dividedBy(unitPrice).times(100);
    const popularity = totalQty.isZero() ? new Decimal(0) : quantitySold.dividedBy(totalQty);

    return {
      recipeId,
      recipeName: agg.recipeName,
      quantitySold,
      grossUnitPrice,
      unitPrice,
      cost,
      totalCost,
      margin,
      totalMargin,
      costPct,
      popularity,
      costUnreliable,
    };
  });

  return classifyMenuItems(partial, totalQty);
}

export type MenuEngineeringThresholds = {
  /** Margen de contribucion promedio ponderado: margen total del menu / piezas vendidas. */
  averageMargin: Decimal;
  /** 70% de la popularidad esperada si todo se vendiera por igual (1/N). */
  popularityThreshold: Decimal;
};

/**
 * Kasavana & Smith, los dos ejes del metodo:
 *
 *   - Margen: el margen de contribucion UNITARIO contra el promedio PONDERADO del menu
 *     (margen total / piezas vendidas), no contra el promedio simple de los platillos. Un
 *     promedio simple le daria el mismo peso a un platillo que sale 3 veces al mes que a uno
 *     que sale 345, y correria el umbral hacia los platillos raros y caros.
 *   - Popularidad: la participacion en piezas contra el 70% de 1/N. El 70% es el umbral
 *     original del metodo: exigir el 100% condenaria por definicion a la mitad del menu.
 *
 * Es deliberado que el costo porcentual no entre: el metodo compara dinero, no porcentajes,
 * justo porque un platillo de costo bajo puede dejar menos pesos que uno de costo alto.
 */
export function classifyMenuItems<T extends { margin: Decimal; quantitySold: Decimal; popularity: Decimal }>(
  items: T[],
  totalQty: Decimal,
): (T & { classification: MenuEngineeringClassification })[] {
  const { averageMargin, popularityThreshold } = menuEngineeringThresholds(items, totalQty);

  return items.map((row) => {
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

export function menuEngineeringThresholds(
  items: { margin: Decimal; quantitySold: Decimal }[],
  totalQty: Decimal,
): MenuEngineeringThresholds {
  const weightedMarginSum = items.reduce(
    (sum, row) => sum.plus(row.margin.times(row.quantitySold)),
    new Decimal(0),
  );
  return {
    averageMargin: totalQty.isZero() ? new Decimal(0) : weightedMarginSum.dividedBy(totalQty),
    popularityThreshold:
      items.length === 0
        ? new Decimal(0)
        : new Decimal(1).dividedBy(items.length).times(POPULARITY_THRESHOLD_FACTOR),
  };
}
