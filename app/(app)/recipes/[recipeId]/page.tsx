import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { updateRecipeInstructions } from "../actions";
import AddRecipeItemForm from "./AddRecipeItemForm";
import EditRecipeDetailsForm from "./EditRecipeDetailsForm";
import RecipePhotoForm from "./RecipePhotoForm";
import RecipeIngredientsTable, { type IngredientRow } from "./RecipeIngredientsTable";
import type { RecipeGraph } from "@/lib/costing";
import Decimal from "decimal.js";
import { formatMoney } from "@/lib/format";

type ItemLike = { productId: string | null; subRecipeId: string | null; quantity: Decimal; unit: string };
type ProductLike = { baseUnit: string; currentUnitCost: Decimal } | null;
type SubRecipeLike = { yieldUnit: string } | null;

function computeUnitCost(
  item: ItemLike,
  product: ProductLike,
  subRecipe: SubRecipeLike,
  graph: RecipeGraph,
  memo: Map<string, Decimal>,
): Decimal | null {
  try {
    if (item.productId && product) {
      const perUnit = convertQty(1, item.unit as UnitValue, product.baseUnit as UnitValue);
      return perUnit.times(product.currentUnitCost);
    }
    if (item.subRecipeId && subRecipe) {
      const subCost = getRecipeCost(item.subRecipeId, graph, memo);
      const subYield = graph.recipes.get(item.subRecipeId)?.yieldQty;
      if (subYield && !subYield.isZero()) {
        const perUnit = convertQty(1, item.unit as UnitValue, subRecipe.yieldUnit as UnitValue);
        return perUnit.times(subCost.dividedBy(subYield));
      }
    }
  } catch {
    return null;
  }
  return null;
}

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const user = await requireOrgSession();

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: user.organizationId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { product: { include: { category: true } }, subRecipe: true },
      },
    },
  });
  if (!recipe) notFound();

  const graph = await loadOrgRecipeGraph(user.organizationId);
  const memo = new Map<string, Decimal>();

  let totalCost;
  let costError: string | null = null;
  try {
    totalCost = getRecipeCost(recipe.id, graph, memo);
  } catch (e) {
    costError = e instanceof Error ? e.message : "Error de costeo";
  }

  const sellingPrice = recipe.sellingPrice ? Number(recipe.sellingPrice) : null;
  const costPct =
    !costError && sellingPrice && sellingPrice > 0
      ? totalCost!.dividedBy(sellingPrice).times(100).toNumber()
      : null;

  const subRecipeIds = [...new Set(recipe.items.filter((i) => i.subRecipeId).map((i) => i.subRecipeId!))];
  const nestedItems = subRecipeIds.length
    ? await prisma.recipeItem.findMany({
        where: { recipeId: { in: subRecipeIds } },
        orderBy: { sortOrder: "asc" },
        include: { product: { include: { category: true } }, subRecipe: true },
      })
    : [];
  const nestedItemsByRecipeId = new Map<string, typeof nestedItems>();
  for (const ni of nestedItems) {
    const list = nestedItemsByRecipeId.get(ni.recipeId) ?? [];
    list.push(ni);
    nestedItemsByRecipeId.set(ni.recipeId, list);
  }

  // Para poder enlazar el costo de cada ingrediente-producto a la compra que lo establecio,
  // buscamos la compra mas reciente de cada producto involucrado (directo o dentro de subrecetas).
  const ingredientProductIds = [
    ...new Set(
      [...recipe.items, ...nestedItems]
        .map((i) => i.productId)
        .filter((id): id is string => !!id),
    ),
  ];
  const latestPurchases = ingredientProductIds.length
    ? await prisma.purchase.findMany({
        where: { organizationId: user.organizationId, productId: { in: ingredientProductIds } },
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        select: { productId: true, folio: true },
      })
    : [];
  const latestFolioByProduct = new Map<string, number>();
  for (const p of latestPurchases) {
    if (!latestFolioByProduct.has(p.productId)) latestFolioByProduct.set(p.productId, p.folio);
  }

  const [products, allRecipes] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.recipe.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldUnit: true },
    }),
  ]);
  const subRecipeOptions = allRecipes.filter((r) => r.id !== recipe.id);

  const rows: IngredientRow[] = recipe.items.map((item) => {
    const unitCost = computeUnitCost(item, item.product, item.subRecipe, graph, memo);
    const lineCost = unitCost ? formatMoney(unitCost.times(item.quantity).toNumber()) : null;
    const label = item.product?.name ?? item.subRecipe?.name ?? "?";

    let breakdown: IngredientRow["breakdown"];
    if (item.subRecipeId && item.subRecipe) {
      const subItems = nestedItemsByRecipeId.get(item.subRecipeId) ?? [];
      let subTotalCost: string | null = null;
      try {
        subTotalCost = formatMoney(getRecipeCost(item.subRecipeId, graph, memo).toNumber());
      } catch {
        subTotalCost = null;
      }
      breakdown = {
        yieldLabel: `${item.subRecipe.yieldQty.toString()} ${UNIT_LABELS[item.subRecipe.yieldUnit as UnitValue]}`,
        totalCost: subTotalCost,
        items: subItems.map((si) => {
          const siUnitCost = computeUnitCost(si, si.product, si.subRecipe, graph, memo);
          return {
            label: si.product?.name ?? si.subRecipe?.name ?? "?",
            isSubRecipe: !!si.subRecipeId,
            categoryName: si.product?.category?.name ?? null,
            quantity: si.quantity.toString(),
            unitLabel: UNIT_LABELS[si.unit as UnitValue],
            unitCost: siUnitCost ? formatMoney(siUnitCost.toNumber(), 4) : null,
            lineCost: siUnitCost ? formatMoney(siUnitCost.times(si.quantity).toNumber()) : null,
            latestPurchaseFolio: si.productId ? latestFolioByProduct.get(si.productId) ?? null : null,
          };
        }),
      };
    }

    return {
      id: item.id,
      label,
      isSubRecipe: !!item.subRecipeId,
      subRecipeId: item.subRecipeId,
      categoryName: item.product?.category?.name ?? null,
      quantity: item.quantity.toString(),
      unitLabel: UNIT_LABELS[item.unit as UnitValue],
      unitCost: unitCost ? formatMoney(unitCost.toNumber(), 4) : null,
      lineCost,
      latestPurchaseFolio: item.productId ? latestFolioByProduct.get(item.productId) ?? null : null,
      breakdown,
    };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start gap-4">
          <RecipePhotoForm
            recipeId={recipe.id}
            hasPhoto={!!recipe.photo}
            updatedAt={recipe.updatedAt.getTime()}
          />
          <div className="flex-1">
            <EditRecipeDetailsForm
              recipeId={recipe.id}
              name={recipe.name}
              yieldQty={recipe.yieldQty.toString()}
              yieldUnit={recipe.yieldUnit as UnitValue}
              isMenuItem={recipe.isMenuItem}
              sellingPrice={recipe.sellingPrice ? recipe.sellingPrice.toString() : null}
            />
          </div>
        </div>
        <nav className="flex gap-4 border-b border-neutral-200 text-sm">
          <span className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900">
            Detalle
          </span>
          <Link
            href={`/recipes/${recipe.id}/activity`}
            className="pb-2 text-neutral-500 hover:text-neutral-900"
          >
            Bitacora
          </Link>
        </nav>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-500">Costo total de la receta</p>
        {costError ? (
          <p className="text-lg font-semibold text-red-600">{costError}</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold text-neutral-900">{formatMoney(totalCost!.toNumber())}</p>
              {costPct !== null && (
                <span
                  className={`rounded-full px-2 py-0.5 text-sm font-semibold ${
                    costPct <= 33 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {costPct.toFixed(1)}% costo
                </span>
              )}
            </div>
            {!recipe.yieldQty.isZero() && (
              <p className="text-sm text-neutral-500">
                {formatMoney(totalCost!.dividedBy(recipe.yieldQty).toNumber(), 4)} por{" "}
                {UNIT_LABELS[recipe.yieldUnit as UnitValue]}
              </p>
            )}
          </>
        )}
      </div>

      <RecipeIngredientsTable recipeId={recipe.id} rows={rows} />

      <AddRecipeItemForm
        recipeId={recipe.id}
        recipeYieldQty={recipe.yieldQty.toString()}
        recipeYieldUnit={recipe.yieldUnit as UnitValue}
        products={products.map((p) => ({ ...p, baseUnit: p.baseUnit as UnitValue }))}
        subRecipeOptions={subRecipeOptions.map((r) => ({ ...r, yieldUnit: r.yieldUnit as UnitValue }))}
      />

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <form
          action={async (formData: FormData) => {
            "use server";
            await updateRecipeInstructions(recipe.id, formData);
          }}
          className="space-y-2"
        >
          <label htmlFor="instructions" className="text-sm font-medium text-neutral-700">
            Procedimientos
          </label>
          <textarea
            id="instructions"
            name="instructions"
            rows={8}
            defaultValue={recipe.instructions ?? ""}
            placeholder="Describe aqui el paso a paso de preparacion de esta receta..."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Guardar procedimientos
          </button>
        </form>
      </div>

      <Link href="/recipes" className="inline-block text-sm text-neutral-500 hover:underline">
        Volver a recetas
      </Link>
    </div>
  );
}
