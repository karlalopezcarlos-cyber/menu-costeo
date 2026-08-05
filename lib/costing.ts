import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { convertQty, type UnitValue } from "@/lib/units";

export class CircularReferenceError extends Error {
  constructor(recipeName: string) {
    super(
      `No se puede guardar: crearia una referencia circular de subrecetas (la receta "${recipeName}" terminaria dependiendo de si misma).`,
    );
    this.name = "CircularReferenceError";
  }
}

type RecipeItemWithProduct = {
  id: string;
  productId: string | null;
  subRecipeId: string | null;
  quantity: Decimal;
  unit: UnitValue;
  product: { baseUnit: UnitValue; currentUnitCost: Decimal } | null;
};

type RecipeNode = {
  id: string;
  name: string;
  yieldQty: Decimal;
  yieldUnit: UnitValue;
  items: RecipeItemWithProduct[];
};

export type RecipeGraph = {
  recipes: Map<string, RecipeNode>;
  /** Costo unitario vigente de cada producto EN ESTA SUCURSAL (ver getSucursalProductCosts). */
  productCosts: Map<string, Decimal>;
};

const MAX_DEPTH = 20;

/**
 * Costo unitario vigente de un producto para una sucursal especifica: el `computedUnitCost` de su
 * compra mas reciente EN ESA SUCURSAL (no el ultimo `Product.currentUnitCost` global, que se
 * actualiza con la compra mas reciente de cualquier sucursal y por lo tanto mezclaria precios entre
 * sucursales). Si esa sucursal nunca ha comprado el producto, no aparece en el mapa (costo 0 /
 * "no confiable" para quien lo consuma).
 */
export async function getSucursalProductCosts(
  sucursalId: string,
  productIds: string[],
): Promise<Map<string, Decimal>> {
  const costByProduct = new Map<string, Decimal>();
  if (productIds.length === 0) return costByProduct;

  const purchases = await prisma.purchase.findMany({
    where: { sucursalId, productId: { in: productIds } },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
    select: { productId: true, computedUnitCost: true },
  });
  for (const p of purchases) {
    if (!costByProduct.has(p.productId)) costByProduct.set(p.productId, new Decimal(p.computedUnitCost));
  }
  return costByProduct;
}

/**
 * Carga todas las recetas (no archivadas) de una sucursal en una sola consulta, para costear sin
 * N+1 queries. Cada sucursal opera como un mini-restaurante independiente: sus recetas, las
 * referencias a subrecetas que contienen, y el costo de cada producto (su compra mas reciente EN
 * ESA SUCURSAL, no el costo global del catalogo) quedan siempre dentro de la misma sucursal.
 */
export async function loadOrgRecipeGraph(sucursalId: string): Promise<RecipeGraph> {
  const recipes = await prisma.recipe.findMany({
    where: { sucursalId, archivedAt: null },
    include: {
      items: {
        include: { product: { select: { id: true, baseUnit: true } } },
      },
    },
  });

  const productIds = [
    ...new Set(
      recipes.flatMap((r) => r.items.map((i) => i.productId).filter((id): id is string => !!id)),
    ),
  ];
  const productCosts = await getSucursalProductCosts(sucursalId, productIds);

  return {
    productCosts,
    recipes: new Map(
      recipes.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          yieldQty: new Decimal(r.yieldQty),
          yieldUnit: r.yieldUnit as UnitValue,
          items: r.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            subRecipeId: i.subRecipeId,
            quantity: new Decimal(i.quantity),
            unit: i.unit as UnitValue,
            product: i.product
              ? {
                  baseUnit: i.product.baseUnit as UnitValue,
                  currentUnitCost: productCosts.get(i.product.id) ?? new Decimal(0),
                }
              : null,
          })),
        },
      ]),
    ),
  };
}

/**
 * Costo total (en vivo) de una receta: suma recursiva de productos + subrecetas,
 * usando los precios vigentes de los productos. Memoiza dentro de una misma llamada
 * (util cuando varias recetas comparten una subreceta base) y detecta ciclos con
 * una pila de recursion.
 */
export function getRecipeCost(
  recipeId: string,
  graph: RecipeGraph,
  memo: Map<string, Decimal> = new Map(),
  stack: Set<string> = new Set(),
  depth = 0,
): Decimal {
  if (depth > MAX_DEPTH) {
    throw new Error("Profundidad de subrecetas excesiva (posible dato corrupto).");
  }
  const cached = memo.get(recipeId);
  if (cached) return cached;

  const recipe = graph.recipes.get(recipeId);
  if (!recipe) throw new Error(`Receta ${recipeId} no encontrada.`);

  if (stack.has(recipeId)) {
    throw new CircularReferenceError(recipe.name);
  }
  stack.add(recipeId);

  let total = new Decimal(0);
  for (const item of recipe.items) {
    if (item.productId && item.product) {
      const qtyInBase = convertQty(item.quantity, item.unit, item.product.baseUnit);
      total = total.plus(qtyInBase.times(item.product.currentUnitCost));
    } else if (item.subRecipeId) {
      const subRecipe = graph.recipes.get(item.subRecipeId);
      if (!subRecipe) throw new Error(`Subreceta ${item.subRecipeId} no encontrada.`);
      const subCost = getRecipeCost(item.subRecipeId, graph, memo, stack, depth + 1);
      const qtyUsedInYieldUnit = convertQty(item.quantity, item.unit, subRecipe.yieldUnit);
      const costPerYieldUnit = subRecipe.yieldQty.isZero()
        ? new Decimal(0)
        : subCost.dividedBy(subRecipe.yieldQty);
      total = total.plus(qtyUsedInYieldUnit.times(costPerYieldUnit));
    }
  }

  stack.delete(recipeId);
  memo.set(recipeId, total);
  return total;
}

/**
 * Verifica, antes de guardar, si agregar `candidateSubRecipeId` como ingrediente de `recipeId`
 * crearia un ciclo (que candidateSubRecipeId dependa, directa o indirectamente, de recipeId).
 * Se corre sobre el grafo ya cargado en memoria, sin queries adicionales.
 */
export function wouldCreateCycle(
  recipeId: string,
  candidateSubRecipeId: string,
  graph: RecipeGraph,
): boolean {
  if (recipeId === candidateSubRecipeId) return true;

  const visited = new Set<string>();
  const stack = [candidateSubRecipeId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === recipeId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const current = graph.recipes.get(currentId);
    if (!current) continue;
    for (const item of current.items) {
      if (item.subRecipeId) stack.push(item.subRecipeId);
    }
  }

  return false;
}

export type RecipeUsage = {
  /** productId -> cantidad (en la unidad base del producto) por 1 unidad del rendimiento. */
  products: Map<string, Decimal>;
  /** subRecipeId -> cantidad (en la unidad de rendimiento de esa subreceta) por 1 unidad del rendimiento. */
  subRecipes: Map<string, Decimal>;
};

function addTo(map: Map<string, Decimal>, key: string, value: Decimal) {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(value));
}

/**
 * Cuanto de cada producto base Y de cada subreceta se consume DIRECTAMENTE por 1 unidad del
 * rendimiento de esta receta (un solo nivel, sin bajar recursivamente por las subrecetas).
 * A diferencia de getRecipeCost (que si aplana todo para sumar dinero), esto se usa para
 * descontar cantidades de inventario: una venta o una produccion solo descuenta lo que su
 * receta lista de forma directa. Si un ingrediente es una subreceta, se descuenta esa subreceta
 * (su propio renglon de inventario) y no vuelve a bajar a los productos que la componen — esos
 * ya se descontaron cuando esa subreceta se produjo (ver ProductionEntry). Bajar recursivamente
 * aqui causaria doble descuento: una vez al producir la subreceta y otra vez al vender/usar
 * cualquier receta que la contenga.
 */
export function getRecipeUsagePerUnit(recipeId: string, graph: RecipeGraph): RecipeUsage {
  const recipe = graph.recipes.get(recipeId);
  if (!recipe) throw new Error(`Receta ${recipeId} no encontrada.`);

  const usage: RecipeUsage = { products: new Map(), subRecipes: new Map() };
  if (recipe.yieldQty.isZero()) return usage;

  for (const item of recipe.items) {
    if (item.productId && item.product) {
      const qtyInBase = convertQty(item.quantity, item.unit, item.product.baseUnit).dividedBy(
        recipe.yieldQty,
      );
      addTo(usage.products, item.productId, qtyInBase);
    } else if (item.subRecipeId) {
      const subRecipe = graph.recipes.get(item.subRecipeId);
      if (!subRecipe) throw new Error(`Subreceta ${item.subRecipeId} no encontrada.`);
      const qtyOfSubPerUnit = convertQty(item.quantity, item.unit, subRecipe.yieldUnit).dividedBy(
        recipe.yieldQty,
      );
      addTo(usage.subRecipes, item.subRecipeId, qtyOfSubPerUnit);
    }
  }

  return usage;
}

/** Recalcula Product.currentUnitCost a partir de la compra con purchaseDate mas reciente. */
export async function recalcProductCurrentCost(productId: string) {
  const latest = await prisma.purchase.findFirst({
    where: { productId },
    orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      currentUnitCost: latest?.computedUnitCost ?? 0,
      currentUnitCostUpdatedAt: latest?.purchaseDate ?? null,
    },
  });
}
