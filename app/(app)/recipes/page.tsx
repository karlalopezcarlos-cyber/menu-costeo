import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { parseRecipeTypeFilter, recipeTypeFilterToIsMenuItem } from "@/lib/recipes-filter";
import RecipesTable, { type RecipeRow } from "./RecipesTable";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; view?: string }>;
}) {
  const user = await requireSucursalContext();
  const { type, view } = await searchParams;
  const typeFilter = parseRecipeTypeFilter(type);
  const isMenuItem = recipeTypeFilterToIsMenuItem(typeFilter);
  const exportQuery = typeFilter === "all" ? "" : `?type=${typeFilter}`;
  const showArchived = view === "archived";

  const [graph, recipes] = await Promise.all([
    loadOrgRecipeGraph(user.sucursalId),
    prisma.recipe.findMany({
      where: {
        sucursalId: user.sucursalId,
        archivedAt: showArchived ? { not: null } : null,
        ...(isMenuItem !== undefined && { isMenuItem }),
      },
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
          {showArchived ? (
            <Link href="/recipes" className="text-sm text-neutral-500 hover:underline">
              Ver activas
            </Link>
          ) : (
            <Link href="/recipes?view=archived" className="text-sm text-neutral-500 hover:underline">
              Ver archivadas
            </Link>
          )}
          <a
            href={`/api/export/recipes${exportQuery}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar costos
          </a>
          <a
            href={`/api/export/recipes/ingredients${exportQuery}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar recetas
          </a>
          <a
            href={`/api/export/recipes/pdf${exportQuery}`}
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

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        {showArchived && <input type="hidden" name="view" value="archived" />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="block text-sm font-medium text-neutral-700">
            Tipo de receta
          </label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className="min-w-56 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="plu">Solo PLU (platillos de menu)</option>
            <option value="subrecipe">Solo subrecetas</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Ver
        </button>
      </form>

      <RecipesTable rows={rows} showArchived={showArchived} />
    </div>
  );
}
