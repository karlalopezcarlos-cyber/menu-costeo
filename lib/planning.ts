import Decimal from "decimal.js";
import { getRecipeUsagePerUnit, type RecipeGraph, type RecipeUsage } from "@/lib/costing";
import type { TheoreticalStock } from "@/lib/audit";

export type PlanningTarget = { recipeId: string; quantity: Decimal };

export type ProductionNeedRow = {
  subRecipeId: string;
  grossQty: Decimal;
  onHandQty: Decimal;
  netQty: Decimal;
};

export type PurchaseNeedRow = {
  productId: string;
  grossQty: Decimal;
  onHandQty: Decimal;
  netQty: Decimal;
};

export type PlanningResult = {
  productionNeeds: ProductionNeedRow[];
  purchaseNeeds: PurchaseNeedRow[];
};

const MAX_NODES = 500;

/**
 * Explosion de necesidades tipo MRP: dado cuanto se quiere vender de cada PLU, calcula cuanto hace
 * falta PRODUCIR de cada subreceta y cuanto hace falta COMPRAR de cada producto, descontando en
 * cada nivel lo que ya se tiene en existencia (TheoreticalStock) antes de seguir bajando por el
 * arbol -- si ya hay suficiente de una subreceta, esa rama no se explota mas.
 *
 * Los PLU (targets) NUNCA se netean contra su propia existencia: "quiero vender 50" es la demanda
 * fija que se quiere cubrir, no un objetivo de inventario a alcanzar.
 *
 * Para que una subreceta compartida por varias ramas (o usada tanto directo como a traves de otra
 * subreceta) se descuente UNA SOLA VEZ contra su existencia, se procesa en orden topologico
 * (algoritmo de Kahn): un nodo solo se resuelve (se conoce su demanda TOTAL, ya sumada de todos sus
 * padres dentro del arbol alcanzable) hasta que todos los nodos que lo usan directamente ya fueron
 * procesados. Sin esto, dos platillos que comparten una subreceta podrian "ver" el mismo inventario
 * disponible por separado y cubrirla dos veces.
 */
export function explodePurchasingPlan(
  targets: PlanningTarget[],
  graph: RecipeGraph,
  stock: TheoreticalStock,
): PlanningResult {
  const targetIds = new Set(targets.map((t) => t.recipeId));

  const usageById = new Map<string, RecipeUsage>();
  function usageOf(id: string): RecipeUsage {
    let usage = usageById.get(id);
    if (!usage) {
      usage = getRecipeUsagePerUnit(id, graph);
      usageById.set(id, usage);
    }
    return usage;
  }

  // 1) Nodos alcanzables: los targets + toda subreceta que usen, recursivamente.
  const reachable = new Set<string>(targetIds);
  const queue = [...targetIds];
  let guard = 0;
  while (queue.length > 0) {
    if (++guard > MAX_NODES) {
      throw new Error("Arbol de recetas demasiado grande o con una referencia circular no detectada.");
    }
    const id = queue.shift()!;
    for (const subId of usageOf(id).subRecipes.keys()) {
      if (!reachable.has(subId)) {
        reachable.add(subId);
        queue.push(subId);
      }
    }
  }

  // 2) Grado de entrada: cuantos nodos (dentro de lo alcanzable) usan directamente a cada nodo.
  const indegree = new Map<string, number>([...reachable].map((id) => [id, 0]));
  const childrenByParent = new Map<string, string[]>();
  for (const id of reachable) {
    const children = [...usageOf(id).subRecipes.keys()];
    childrenByParent.set(id, children);
    for (const childId of children) {
      indegree.set(childId, (indegree.get(childId) ?? 0) + 1);
    }
  }

  // 3) Kahn: arranca con los nodos sin padres dentro del arbol alcanzable (normalmente los
  // targets); cuando un PLU tambien es ingrediente de otra receta, su indegree > 0 y se procesa
  // despues, ya con su demanda completa acumulada.
  const demand = new Map<string, Decimal>();
  for (const t of targets) demand.set(t.recipeId, (demand.get(t.recipeId) ?? new Decimal(0)).plus(t.quantity));

  const ready: string[] = [...reachable].filter((id) => (indegree.get(id) ?? 0) === 0);
  const grossProductQty = new Map<string, Decimal>();
  const productionRows: ProductionNeedRow[] = [];
  const processed = new Set<string>();

  while (ready.length > 0) {
    const id = ready.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);

    const totalDemand = demand.get(id) ?? new Decimal(0);
    const isTarget = targetIds.has(id);

    let outgoingQty: Decimal;
    if (isTarget) {
      outgoingQty = totalDemand;
    } else {
      const onHand = stock.subRecipeQty.get(id) ?? new Decimal(0);
      const netQty = Decimal.max(totalDemand.minus(onHand), 0);
      productionRows.push({ subRecipeId: id, grossQty: totalDemand, onHandQty: onHand, netQty });
      outgoingQty = netQty;
    }

    if (outgoingQty.gt(0)) {
      const usage = usageOf(id);
      for (const [productId, perUnit] of usage.products) {
        grossProductQty.set(
          productId,
          (grossProductQty.get(productId) ?? new Decimal(0)).plus(perUnit.times(outgoingQty)),
        );
      }
      for (const [subId, perUnit] of usage.subRecipes) {
        demand.set(subId, (demand.get(subId) ?? new Decimal(0)).plus(perUnit.times(outgoingQty)));
      }
    }

    for (const childId of childrenByParent.get(id) ?? []) {
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) ready.push(childId);
    }
  }

  if (processed.size < reachable.size) {
    throw new Error("No se pudo resolver el orden de subrecetas (posible referencia circular).");
  }

  const purchaseNeeds: PurchaseNeedRow[] = [...grossProductQty.entries()].map(([productId, grossQty]) => {
    const onHand = stock.productQty.get(productId) ?? new Decimal(0);
    return { productId, grossQty, onHandQty: onHand, netQty: Decimal.max(grossQty.minus(onHand), 0) };
  });

  return { productionNeeds: productionRows, purchaseNeeds };
}
