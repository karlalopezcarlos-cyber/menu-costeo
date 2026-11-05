import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { collectRecipeCostIssues, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";

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
  /** Categoria de la receta, para poder analizar grupos comparables por separado. */
  categoryName: string | null;
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
  /** null cuando el costo no es confiable: clasificar con un costo incompleto es inventar. */
  classification: MenuEngineeringClassification | null;
  costUnreliable: boolean;
  /** Por que no se confia en el costo. Vacio cuando el costeo esta completo. */
  costIssues: string[];
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
    include: { recipe: { include: { category: { select: { name: true } } } } },
  });

  if (sales.length === 0) return [];

  // Puede haber varias filas por receta (una por dia) dentro del periodo; se agrupan sumando
  // la cantidad y usando un precio promedio ponderado por cantidad.
  const byRecipe = new Map<
    string,
    { recipeName: string; categoryName: string | null; quantitySold: Decimal; weightedPriceSum: Decimal }
  >();
  for (const sale of sales) {
    const qty = new Decimal(sale.quantitySold);
    const existing = byRecipe.get(sale.recipeId);
    if (existing) {
      existing.quantitySold = existing.quantitySold.plus(qty);
      existing.weightedPriceSum = existing.weightedPriceSum.plus(qty.times(sale.unitPrice));
    } else {
      byRecipe.set(sale.recipeId, {
        recipeName: sale.recipe.name,
        categoryName: sale.recipe.category?.name ?? null,
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
    let costIssues: string[] = [];
    try {
      cost = getRecipeCost(recipeId, graph, memo);
      costIssues = collectRecipeCostIssues(recipeId, graph);
      // Un costo en cero sin agujero detectado tampoco es un costo: es una receta que no se
      // pudo recorrer por una razon que no previmos.
      if (cost.lte(0) && costIssues.length === 0) {
        costIssues = ["El costeo de esta receta da $0 y no se pudo determinar por que."];
      }
    } catch (error) {
      costIssues = [error instanceof Error ? error.message : "No se pudo costear la receta."];
    }
    const costUnreliable = costIssues.length > 0;

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
      categoryName: agg.categoryName,
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
      costIssues,
    };
  });

  return classifyMenuItems(partial);
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
export type ClassifiableItem = {
  margin: Decimal;
  quantitySold: Decimal;
  popularity: Decimal;
  costUnreliable: boolean;
};

export function classifyMenuItems<T extends ClassifiableItem>(
  items: T[],
): (T & { classification: MenuEngineeringClassification | null })[] {
  const { averageMargin, popularityThreshold } = menuEngineeringThresholds(items);

  return items.map((row) => {
    // Un platillo que no se pudo costear no se clasifica. Su margen es el precio completo o
    // casi, asi que caeria siempre del lado alto y la pantalla diria "promueve este platillo"
    // de algo cuyo costo nadie conoce. Decir "revisa la receta" es la respuesta honesta.
    if (row.costUnreliable) return { ...row, classification: null };

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

/**
 * El umbral de margen se calcula SOLO con los platillos bien costeados. Un platillo sin costo
 * tiene margen igual a su precio, y meterlo al promedio corre el umbral hacia arriba y
 * reclasifica platillos que no tenian nada malo: en una prueba, un solo platillo asi movio el
 * promedio de $89.89 a $105.45.
 *
 * El de popularidad si cuenta a todos. Lo que se vendio se vendio; que no sepamos costearlo no
 * lo borra de la mezcla de ventas.
 */
export function menuEngineeringThresholds(items: ClassifiableItem[]): MenuEngineeringThresholds {
  const confiables = items.filter((row) => !row.costUnreliable);
  const qtyConfiable = confiables.reduce((sum, row) => sum.plus(row.quantitySold), new Decimal(0));
  const weightedMarginSum = confiables.reduce(
    (sum, row) => sum.plus(row.margin.times(row.quantitySold)),
    new Decimal(0),
  );
  return {
    averageMargin: qtyConfiable.isZero() ? new Decimal(0) : weightedMarginSum.dividedBy(qtyConfiable),
    popularityThreshold:
      items.length === 0
        ? new Decimal(0)
        : new Decimal(1).dividedBy(items.length).times(POPULARITY_THRESHOLD_FACTOR),
  };
}
