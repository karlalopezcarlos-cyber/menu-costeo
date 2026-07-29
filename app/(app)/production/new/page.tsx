import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";
import ProductionForm from "./ProductionForm";

export default async function NewProductionPage() {
  const user = await requireOrgSession();

  const [subRecipes, graph] = await Promise.all([
    prisma.recipe.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldUnit: true },
    }),
    loadOrgRecipeGraph(user.organizationId),
  ]);

  const memo = new Map<string, Decimal>();

  const subRecipeOptions = subRecipes.map((recipe) => {
    let unitCost = 0;
    const node = graph.recipes.get(recipe.id);
    if (node && !node.yieldQty.isZero()) {
      try {
        unitCost = getRecipeCost(recipe.id, graph, memo).dividedBy(node.yieldQty).toNumber();
      } catch {
        unitCost = 0;
      }
    }
    return {
      id: recipe.id,
      name: recipe.name,
      yieldUnit: recipe.yieldUnit as UnitValue,
      unitCost,
    };
  });

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Registrar produccion</h1>
      {subRecipeOptions.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Primero agrega al menos una subreceta en Recetas.
        </p>
      ) : (
        <ProductionForm subRecipes={subRecipeOptions} />
      )}
    </div>
  );
}
