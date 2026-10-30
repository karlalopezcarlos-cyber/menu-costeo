import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost, getRecipeFlatProductUsage } from "@/lib/costing";
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
  // Nombres de los productos, para poder buscar recetas por insumo ("que lleva cebolla").
  const productCatalog = await prisma.product.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true, baseUnit: true },
  });
  const productById = new Map(productCatalog.map((p) => [p.id, p]));

  const memo = new Map();
  const usageMemo = new Map<string, Map<string, import("decimal.js").default>>();

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

    // Ingredientes aplanados: incluye los que vienen dentro de una subreceta, porque la
    // pregunta "que recetas llevan cebolla" no distingue niveles.
    const directProductIds = new Set(
      (graph.recipes.get(recipe.id)?.items ?? [])
        .map((i) => i.productId)
        .filter((id): id is string => Boolean(id)),
    );
    // El buscador por ingrediente no puede tumbar la pantalla: si una receta no se puede
    // aplanar, esa se queda sin lista de ingredientes y las demas siguen saliendo.
    let flatUsage: Map<string, import("decimal.js").default>;
    try {
      flatUsage = getRecipeFlatProductUsage(recipe.id, graph, usageMemo);
    } catch {
      flatUsage = new Map();
    }
    const ingredients = [...flatUsage.entries()]
      .map(([productId, qtyPerYieldUnit]) => {
        const product = productById.get(productId);
        if (!product) return null;
        const total = qtyPerYieldUnit.times(recipe.yieldQty);
        return {
          name: product.name,
          qtyLabel: `${total.toDecimalPlaces(4).toNumber().toLocaleString("es-MX", {
            maximumFractionDigits: 4,
          })} ${UNIT_LABELS[product.baseUnit as UnitValue]}`,
          direct: directProductIds.has(productId),
        };
      })
      .filter((i): i is { name: string; qtyLabel: string; direct: boolean } => i !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      id: recipe.id,
      name: recipe.name,
      ingredients,
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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Recetas</h1>
        <div className="flex items-center gap-3">
          <Link href="/recipes/categories" className="text-sm text-neutral-500 hover:underline">
            Acomodar categorias
          </Link>
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
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Exportar costos
          </a>
          <a
            href={`/api/export/recipes/ingredients${exportQuery}`}
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Exportar recetas
          </a>
          <a
            href={`/api/export/recipes/pdf${exportQuery}`}
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Exportar a PDF
          </a>
          <Link
            href="/recipes/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Nueva receta
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
        {showArchived && <input type="hidden" name="view" value="archived" />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="block text-sm font-medium text-neutral-700">
            Tipo de receta
          </label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className="min-w-56 rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="plu">Solo PLU (platillos de menu)</option>
            <option value="subrecipe">Solo subrecetas</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Ver
        </button>
      </form>

      <RecipesTable rows={rows} showArchived={showArchived} />
    </div>
  );
}
