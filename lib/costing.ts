import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { applyYieldFactor, computeUnitCost, convertQty, type UnitValue } from "@/lib/units";

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
  product: { name: string; baseUnit: UnitValue; currentUnitCost: Decimal } | null;
};

type RecipeNode = {
  id: string;
  name: string;
  yieldQty: Decimal;
  yieldUnit: UnitValue;
  /** Receta de porcion: define el gramaje de una porcion para el modulo de Porcionamiento. */
  isPortion: boolean;
  /** Costo capturado a mano, para el rendimiento completo. Ver resolveRecipeCost. */
  manualCost: Decimal | null;
  items: RecipeItemWithProduct[];
};

export type RecipeGraph = {
  recipes: Map<string, RecipeNode>;
  /** Costo unitario vigente de cada producto EN ESTA SUCURSAL (ver getSucursalProductCosts). */
  productCosts: Map<string, Decimal>;
  /**
   * De donde salio el costo de cada receta ya resuelta. Vive en el grafo y no en el memo que
   * reciben las funciones porque ese memo es publico y guarda solo montos; aqui hace falta
   * recordar tambien la confianza, que es lo que decide si entra el costo capturado a mano.
   */
  costOrigins: Map<string, RecipeCostOrigin>;
};

/**
 * De donde salio el costo de una receta:
 * - `calculado`: de sus ingredientes, y ninguno quedo sin precio. Es el bueno.
 * - `capturado`: del costo que alguien escribio a mano, porque el calculo no alcanzaba.
 * - `incompleto`: del calculo, pero le falto algo y nadie capturo un respaldo. El numero sale,
 *   pero vale menos de lo que parece.
 */
export type RecipeCostOrigin = "calculado" | "capturado" | "incompleto";

const MAX_DEPTH = 20;

/**
 * Costo unitario vigente de un producto para una sucursal especifica: el `computedUnitCost` de su
 * compra mas reciente EN ESA SUCURSAL (no el ultimo `Product.currentUnitCost` global, que se
 * actualiza con la compra mas reciente de cualquier sucursal y por lo tanto mezclaria precios entre
 * sucursales si se usara como fuente principal). Si esa sucursal nunca ha comprado el producto (ej.
 * lo recibe solo por requisicion, o todavia no lo compra directamente), se usa como respaldo el
 * costo informativo del catalogo (`Product.currentUnitCost`) en vez de dejarlo en 0.
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

  const missingIds = productIds.filter((id) => !costByProduct.has(id));
  if (missingIds.length > 0) {
    const fallbackProducts = await prisma.product.findMany({
      where: { id: { in: missingIds }, currentUnitCost: { gt: 0 } },
      select: { id: true, currentUnitCost: true },
    });
    for (const p of fallbackProducts) {
      costByProduct.set(p.id, new Decimal(p.currentUnitCost));
    }
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
        include: { product: { select: { id: true, name: true, baseUnit: true } } },
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
    costOrigins: new Map(),
    recipes: new Map(
      recipes.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          yieldQty: new Decimal(r.yieldQty),
          yieldUnit: r.yieldUnit as UnitValue,
          isPortion: r.isPortion,
          manualCost: r.manualCost === null ? null : new Decimal(r.manualCost),
          items: r.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            subRecipeId: i.subRecipeId,
            quantity: new Decimal(i.quantity),
            unit: i.unit as UnitValue,
            product: i.product
              ? {
                  name: i.product.name,
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
 *
 * Si al calculo le falta algo y la receta trae un costo capturado a mano, devuelve ese. Ver
 * resolveRecipeCost, que es donde vive esa regla.
 */
export function getRecipeCost(
  recipeId: string,
  graph: RecipeGraph,
  memo: Map<string, Decimal> = new Map(),
  stack: Set<string> = new Set(),
  depth = 0,
): Decimal {
  return resolveRecipeCost(recipeId, graph, memo, stack, depth).total;
}

/**
 * Lo mismo que getRecipeCost, pero diciendo de donde salio el numero.
 *
 * La regla, en una linea: el costeo real manda mientras pueda dar un numero completo; cuando no
 * puede, entra el costo capturado a mano.
 *
 * El orden importa y no es simetrico. Una receta a medias -el nigiri que cuesta el arroz y el
 * alga porque el salmon nunca se compro aqui- devuelve un numero que parece costo. Si ese
 * numero pisara al capturado nada mas por venir de ingredientes, un restaurante veria su
 * platillo de $40 convertido en $4.87 sin que nadie le avise. Por eso el capturado no es un
 * valor por omision: es el que se usa justo cuando el calculo no es de fiar.
 *
 * Al reves tambien: en cuanto la receta queda completa, el calculado manda solo y el capturado
 * se queda de respaldo, sin tener que borrarlo ni tocar el historico.
 */
export function resolveRecipeCost(
  recipeId: string,
  graph: RecipeGraph,
  memo: Map<string, Decimal> = new Map(),
  stack: Set<string> = new Set(),
  depth = 0,
): { total: Decimal; origin: RecipeCostOrigin } {
  if (depth > MAX_DEPTH) {
    throw new Error("Profundidad de subrecetas excesiva (posible dato corrupto).");
  }
  const cached = memo.get(recipeId);
  if (cached) return { total: cached, origin: graph.costOrigins.get(recipeId) ?? "calculado" };

  const recipe = graph.recipes.get(recipeId);
  if (!recipe) throw new Error(`Receta ${recipeId} no encontrada.`);

  if (stack.has(recipeId)) {
    throw new CircularReferenceError(recipe.name);
  }
  stack.add(recipeId);

  // Una receta sin ingredientes no cuesta cero: no se sabe lo que cuesta. Son cosas distintas.
  let falta = recipe.items.length === 0;
  let total = new Decimal(0);
  for (const item of recipe.items) {
    if (item.productId) {
      if (!item.product) {
        falta = true;
        continue;
      }
      if (item.product.currentUnitCost.lte(0)) falta = true;
      const qtyInBase = convertQty(item.quantity, item.unit, item.product.baseUnit);
      total = total.plus(qtyInBase.times(item.product.currentUnitCost));
    } else if (item.subRecipeId) {
      const subRecipe = graph.recipes.get(item.subRecipeId);
      if (!subRecipe) throw new Error(`Subreceta ${item.subRecipeId} no encontrada.`);
      const sub = resolveRecipeCost(item.subRecipeId, graph, memo, stack, depth + 1);
      // Una subreceta resuelta con costo capturado no contagia: ya tiene su numero.
      if (sub.origin === "incompleto") falta = true;
      if (subRecipe.yieldQty.isZero()) falta = true;
      const qtyUsedInYieldUnit = convertQty(item.quantity, item.unit, subRecipe.yieldUnit);
      const costPerYieldUnit = subRecipe.yieldQty.isZero()
        ? new Decimal(0)
        : sub.total.dividedBy(subRecipe.yieldQty);
      total = total.plus(qtyUsedInYieldUnit.times(costPerYieldUnit));
    }
  }

  stack.delete(recipeId);

  let origin: RecipeCostOrigin = falta ? "incompleto" : "calculado";
  if (falta && recipe.manualCost !== null) {
    total = recipe.manualCost;
    origin = "capturado";
  }

  memo.set(recipeId, total);
  graph.costOrigins.set(recipeId, origin);
  return { total, origin };
}

/**
 * Por que NO se puede confiar en el costo de una receta.
 *
 * getRecipeCost suma lo que encuentra y calla lo que falta: un insumo sin costo suma cero, una
 * receta vacia da cero, una subreceta con rendimiento cero aporta cero. El numero sale siempre,
 * se ve razonable y nadie se entera. El caso peligroso no es el costo en $0 (ese salta a la
 * vista): es el costo A MEDIAS, un nigiri de salmon que cuesta el arroz y el alga porque el
 * salmon nunca se compro en esta sucursal. Da $4.87, parece un costo, y con el se clasifica el
 * platillo y se corre el promedio de todos los demas.
 *
 * Esta funcion recorre el mismo arbol que el costeo y devuelve, en texto, cada agujero que
 * encontro. Lista vacia significa que el costo esta completo.
 */
export function collectRecipeCostIssues(
  recipeId: string,
  graph: RecipeGraph,
  stack: Set<string> = new Set(),
  depth = 0,
): string[] {
  if (depth > MAX_DEPTH) return ["La receta se anida demasiado (posible dato corrupto)."];
  const recipe = graph.recipes.get(recipeId);
  if (!recipe) return ["La receta no existe."];
  if (stack.has(recipeId)) return [`La receta "${recipe.name}" se referencia a si misma.`];
  stack.add(recipeId);

  const issues: string[] = [];
  if (recipe.items.length === 0) {
    issues.push(`"${recipe.name}" no tiene ingredientes capturados.`);
  }

  for (const item of recipe.items) {
    if (item.productId) {
      if (!item.product) {
        issues.push(`"${recipe.name}" usa un producto que ya no existe en el catalogo.`);
      } else if (item.product.currentUnitCost.lte(0)) {
        // Sin compras en esta sucursal y sin costo de catalogo: el insumo entra en $0 al costeo.
        issues.push(`${item.product.name} no tiene costo (sin compras capturadas).`);
      }
    } else if (item.subRecipeId) {
      const sub = graph.recipes.get(item.subRecipeId);
      if (!sub) {
        issues.push(`"${recipe.name}" usa una subreceta que ya no existe.`);
      } else {
        if (sub.yieldQty.isZero()) {
          issues.push(`La subreceta "${sub.name}" tiene rendimiento 0, asi que aporta $0.`);
        }
        issues.push(...collectRecipeCostIssues(item.subRecipeId, graph, stack, depth + 1));
      }
    }
  }

  stack.delete(recipeId);
  // Donde entra el costo capturado a mano ya no hay agujero que reportar: el costo quedo
  // resuelto, aunque sea por otra via. Es la misma regla de resolveRecipeCost, y las dos tienen
  // que decir lo mismo; si no, la pantalla marcaria "revisar receta" en platillos que si traen
  // costo y el promedio de ingenieria de menu los dejaria fuera sin razon.
  if (issues.length > 0 && recipe.manualCost !== null) return [];
  return [...new Set(issues)];
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
  // Los productos de proceso (CAMARON LIMPIO) no se compran: su costo lo fija cada limpieza.
  // Recalcularlo desde compras lo dejaria en cero y tiraria el costeo de todas sus recetas.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isProcessed: true },
  });
  if (product?.isProcessed) return;

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

/**
 * Vuelve a costear el historial de un producto cuando cambia su rendimiento.
 *
 * El costo guardado de cada compra (`computedUnitCost`) es el precio pagado dividido entre el
 * rendimiento: es el costo por unidad aprovechable. Si el rendimiento cambia —porque el usuario
 * lo corrigio a mano o porque un porcionamiento midio la realidad— ese costo queda viejo, y con
 * el quedan viejas todas las recetas que usan el producto. Aqui se recalculan las compras y, con
 * ellas, el costo vigente del catalogo.
 *
 * Las compras cuya unidad no sea convertible a la unidad base se dejan intactas en vez de tumbar
 * la operacion: son datos heredados que ya estaban mal y que no deben impedir el ajuste del resto.
 */
export async function recalcProductCostsForYield(
  productId: string,
  baseUnit: UnitValue,
  yieldPercentage: Decimal.Value,
) {
  const purchases = await prisma.purchase.findMany({ where: { productId } });

  const updates = [];
  for (const p of purchases) {
    let newCost: Decimal;
    try {
      const gross = computeUnitCost(
        p.totalPrice,
        p.presentationQty,
        p.presentationUnit as UnitValue,
        baseUnit,
      );
      newCost = applyYieldFactor(gross, yieldPercentage);
    } catch {
      continue;
    }
    updates.push(
      prisma.purchase.update({ where: { id: p.id }, data: { computedUnitCost: newCost.toString() } }),
    );
  }

  // Por lotes: un catalogo con mucho historial se pasa del limite de tiempo de una transaccion.
  const TAMANO_LOTE = 50;
  for (let i = 0; i < updates.length; i += TAMANO_LOTE) {
    await prisma.$transaction(updates.slice(i, i + TAMANO_LOTE));
  }

  await recalcProductCurrentCost(productId);
}

/**
 * Todos los productos que consume una receta, bajando por sus subrecetas.
 *
 * getRecipeUsagePerUnit se queda en el primer nivel porque sirve para descontar inventario (la
 * subreceta tiene su propio renglon). Aqui es al reves: la pregunta es "que recetas llevan
 * cebolla", y la respuesta correcta incluye las que la llevan dentro de una subreceta. Las
 * cantidades son por 1 unidad del rendimiento y en la unidad base de cada producto.
 */
export function getRecipeFlatProductUsage(
  recipeId: string,
  graph: RecipeGraph,
  memo: Map<string, Map<string, Decimal>> = new Map(),
  stack: Set<string> = new Set(),
  depth = 0,
): Map<string, Decimal> {
  const cached = memo.get(recipeId);
  if (cached) return cached;
  if (depth > MAX_DEPTH || stack.has(recipeId)) return new Map();

  const recipe = graph.recipes.get(recipeId);
  if (!recipe || recipe.yieldQty.isZero()) return new Map();

  stack.add(recipeId);
  const total = new Map<string, Decimal>();

  for (const item of recipe.items) {
    // Un ingrediente con la unidad mal (una porcion en PZA dentro de una receta que la pide en
    // gramos) hace tronar la conversion. Esto alimenta el buscador por ingrediente, no el
    // costeo: se salta ese renglon y lo demas se sigue pudiendo buscar. El problema de fondo no
    // se esconde, sale igual en la columna de costo como "Error de costeo".
    try {
      if (item.productId && item.product) {
        const qtyInBase = convertQty(item.quantity, item.unit, item.product.baseUnit).dividedBy(
          recipe.yieldQty,
        );
        addTo(total, item.productId, qtyInBase);
      } else if (item.subRecipeId) {
        const sub = graph.recipes.get(item.subRecipeId);
        if (!sub) continue;
        const subPorUnidad = convertQty(item.quantity, item.unit, sub.yieldUnit).dividedBy(
          recipe.yieldQty,
        );
        const subUsage = getRecipeFlatProductUsage(item.subRecipeId, graph, memo, stack, depth + 1);
        for (const [productId, qty] of subUsage) {
          addTo(total, productId, qty.times(subPorUnidad));
        }
      }
    } catch {
      continue;
    }
  }

  stack.delete(recipeId);
  memo.set(recipeId, total);
  return total;
}
