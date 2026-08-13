"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { getTheoreticalStock } from "@/lib/audit";
import { explodePurchasingPlan, type PlanningTarget } from "@/lib/planning";
import type { UnitValue } from "@/lib/units";
import { PLANNING_RUN_INCLUDE, toPlanningRunView, type PlanningRunWithItems, type PlanningRunView } from "./view";

type PlanningRowInput = { recipeId: string; quantity: string };

export async function runPlanning(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();
    const rowsRaw = String(formData.get("rows") ?? "[]");

    let rows: PlanningRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de planeacion invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un platillo.");
    }

    const recipeIds = [...new Set(rows.map((r) => r.recipeId))];
    const recipes = await prisma.recipe.findMany({
      where: { id: { in: recipeIds }, sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
    });
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    const targets: PlanningTarget[] = rows.map((row, index) => {
      const recipe = recipeById.get(row.recipeId);
      if (!recipe) throw new Error(`Selecciona un platillo valido (fila ${index + 1}).`);
      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) throw new Error(`La cantidad de "${recipe.name}" debe ser mayor a cero.`);
      return { recipeId: recipe.id, quantity };
    });

    const [graph, stock] = await Promise.all([
      loadOrgRecipeGraph(user.sucursalId),
      getTheoreticalStock(user.organizationId, user.sucursalId),
    ]);

    const { productionNeeds, purchaseNeeds } = explodePurchasingPlan(targets, graph, stock);

    const positiveProductionNeeds = productionNeeds.filter((row) => row.netQty.gt(0));

    const products =
      purchaseNeeds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: purchaseNeeds.map((r) => r.productId) } },
            select: { id: true, baseUnit: true, yieldPercentage: true },
          })
        : [];
    const productBaseUnitById = new Map(products.map((p) => [p.id, p.baseUnit as UnitValue]));
    const productYieldById = new Map(products.map((p) => [p.id, p.yieldPercentage]));

    // Lo que las recetas piden (RecipeItem.quantity) es cantidad NETA ya limpia (ej. cebolla
    // pelada), pero se compra en bruto -- si el producto rinde menos de 100%, hay que comprar mas
    // de lo que pide la receta para que, despues de la merma de limpieza, alcance. Se convierte la
    // demanda neta a su equivalente en bruto ANTES de restar la existencia (que ya esta en bruto,
    // como se compra/cuenta), no despues -- de lo contrario un renglon que la existencia ya cubria
    // en neto podria seguir haciendo falta en bruto y quedaria fuera por error.
    const adjustedPurchaseNeeds = purchaseNeeds.map((row) => {
      const yieldPercentage = productYieldById.get(row.productId);
      const yieldFraction = yieldPercentage ? new Decimal(yieldPercentage).dividedBy(100) : new Decimal(1);
      const grossQty = yieldFraction.gt(0) ? row.grossQty.dividedBy(yieldFraction) : row.grossQty;
      return {
        productId: row.productId,
        grossQty,
        onHandQty: row.onHandQty,
        netQty: Decimal.max(grossQty.minus(row.onHandQty), 0),
      };
    });
    const positivePurchaseNeeds = adjustedPurchaseNeeds.filter((row) => row.netQty.gt(0));

    await prisma.$transaction(async (tx) => {
      const run = await tx.planningRun.create({
        data: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          targetsJson: JSON.stringify(rows),
        },
      });

      const itemsToCreate = [
        ...positiveProductionNeeds.map((row, index) => {
          const node = graph.recipes.get(row.subRecipeId);
          return {
            planningRunId: run.id,
            itemType: "production",
            subRecipeId: row.subRecipeId,
            grossQty: row.grossQty.toString(),
            onHandQty: row.onHandQty.toString(),
            netQty: row.netQty.toString(),
            unit: node?.yieldUnit ?? "KG",
            sortOrder: index,
          };
        }),
        ...positivePurchaseNeeds.map((row, index) => ({
          planningRunId: run.id,
          itemType: "purchase",
          productId: row.productId,
          grossQty: row.grossQty.toString(),
          onHandQty: row.onHandQty.toString(),
          // Redondeado a 1 decimal (nadie compra 6.434653 kg de harina).
          netQty: row.netQty.toDecimalPlaces(1).toString(),
          unit: productBaseUnitById.get(row.productId) ?? "KG",
          sortOrder: index,
        })),
      ];

      if (itemsToCreate.length > 0) {
        await tx.planningRunItem.createMany({ data: itemsToCreate });
      }
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo calcular la proyeccion." };
  }

  revalidatePath("/planning/plu");
  return {};
}

export async function toggleItemCompleted(itemId: string, completed: boolean): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();
    await prisma.planningRunItem.updateMany({
      where: { id: itemId, planningRun: { sucursalId: user.sucursalId } },
      data: { completed },
    });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar." };
  }
}

export async function updateItemComment(itemId: string, comment: string): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();
    await prisma.planningRunItem.updateMany({
      where: { id: itemId, planningRun: { sucursalId: user.sucursalId } },
      data: { comment: comment.trim() || null },
    });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar el comentario." };
  }
}

export async function getLatestPlanningRunView(): Promise<PlanningRunView | null> {
  const user = await requireSucursalContext();
  const run: PlanningRunWithItems | null = await prisma.planningRun.findFirst({
    where: { sucursalId: user.sucursalId },
    orderBy: { createdAt: "desc" },
    include: PLANNING_RUN_INCLUDE,
  });
  if (!run) return null;

  // El costo se calcula vigente al momento de VER la lista (no se congela al calcular), igual que
  // el resto de la app muestra costeo en vivo fuera de los registros ya transaccionados.
  const graph = await loadOrgRecipeGraph(user.sucursalId);
  const costMemo = new Map<string, Decimal>();
  const subRecipeCosts = new Map<string, Decimal>();
  for (const item of run.items) {
    if (item.itemType !== "production" || !item.subRecipeId) continue;
    const node = graph.recipes.get(item.subRecipeId);
    if (!node || node.yieldQty.isZero()) continue;
    try {
      subRecipeCosts.set(item.subRecipeId, getRecipeCost(item.subRecipeId, graph, costMemo).dividedBy(node.yieldQty));
    } catch {
      // Subreceta con ciclo o dato invalido: se omite del costeo (queda en 0), no debe tumbar la
      // lista completa.
    }
  }

  return toPlanningRunView(run, { productCosts: graph.productCosts, subRecipeCosts });
}

export type PendingStoreDemand = { recipeId: string; recipeName: string; quantity: string };

/**
 * Cantidad pendiente de surtir por platillo, sumando todos los pedidos "pending" de la tienda en
 * linea (StoreOrder) que todavia no se marcan como atendidos -- para que se puedan cargar como
 * punto de partida al planear cuanto vender/producir/comprar.
 */
export async function getPendingStoreDemand(): Promise<PendingStoreDemand[]> {
  const user = await requireSucursalContext();

  const items = await prisma.storeOrderItem.findMany({
    where: { storeOrder: { sucursalId: user.sucursalId, status: "pending" } },
    include: { recipe: { select: { name: true } } },
  });

  const byRecipe = new Map<string, { recipeName: string; quantity: Decimal }>();
  for (const item of items) {
    const existing = byRecipe.get(item.recipeId);
    const quantity = new Decimal(item.quantity);
    if (existing) {
      existing.quantity = existing.quantity.plus(quantity);
    } else {
      byRecipe.set(item.recipeId, { recipeName: item.recipe.name, quantity });
    }
  }

  return [...byRecipe.entries()].map(([recipeId, { recipeName, quantity }]) => ({
    recipeId,
    recipeName,
    quantity: quantity.toString(),
  }));
}
