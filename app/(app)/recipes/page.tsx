import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import RecipesTable, { type RecipeRow } from "./RecipesTable";

export default async function RecipesPage() {
  const user = await requireSucursalContext();

  const [graph, recipes] = await Promise.all([
    loadOrgRecipeGraph(user.sucursalId),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        yieldQty: true,
        yieldUnit: true,
        isMenuItem: true,
        sellingPrice: true,
        category: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  const memo = new Map();

  const rows: RecipeRow[] = recipes.map((recipe) => {
    let cost = null;
    let costError: string | null = null;
    try {
      cost = getRecipeCost(recipe.id, graph, memo).toNumber();
    } catch (e) {
      costError = e instanceof Error ? e.message : "Error de costeo";
    }

    const yieldQty = Number(recipe.yieldQty);
    const sellingPrice = recipe.sellingPrice ? Number(recipe.sellingPrice) : null;
    const costPerUnit = cost !== null && yieldQty !== 0 ? cost / yieldQty : null;
    const costPct = cost !== null && sellingPrice && sellingPrice > 0 ? (cost / sellingPrice) * 100 : null;

    return {
      id: recipe.id,
      name: recipe.name,
      categoryName: recipe.category?.name ?? null,
      isMenuItem: recipe.isMenuItem,
      yieldQty,
      yieldUnitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
      cost,
      costError,
      costPerUnit,
      sellingPrice,
      costPct,
      itemCount: recipe._count.items,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Recetas</h1>
        <div className="flex items-center gap-3">
          <a
            href="/api/export/recipes"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar costos
          </a>
          <a
            href="/api/export/recipes/ingredients"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar recetas
          </a>
          <a
            href="/api/export/recipes/pdf"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar a PDF
          </a>
          <Link
            href="/recipes/new"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nueva receta
          </Link>
        </div>
      </div>

      <RecipesTable rows={rows} />
    </div>
  );
}
