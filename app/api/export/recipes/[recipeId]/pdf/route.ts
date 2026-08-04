import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost, type RecipeGraph } from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { buildRecipePdf, type RecipePdfItem } from "@/lib/pdf/export-recipe";
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

export async function GET(_request: Request, { params }: { params: Promise<{ recipeId: string }> }) {
  const user = await requireOrgSession();
  const { recipeId } = await params;

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: user.organizationId },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { product: true, subRecipe: true } },
      category: true,
    },
  });
  if (!recipe) {
    return new NextResponse("Receta no encontrada", { status: 404 });
  }

  const graph = await loadOrgRecipeGraph(user.organizationId);
  const memo = new Map<string, Decimal>();

  let totalCost: Decimal | null = null;
  let costError: string | null = null;
  try {
    totalCost = getRecipeCost(recipe.id, graph, memo);
  } catch (e) {
    costError = e instanceof Error ? e.message : "Error de costeo";
  }

  const items: RecipePdfItem[] = recipe.items.map((item) => {
    const unitCost = computeUnitCost(item, item.product, item.subRecipe, graph, memo);
    const lineCost = unitCost ? unitCost.times(item.quantity) : null;
    return {
      label: item.product?.name ?? item.subRecipe?.name ?? "?",
      isSubRecipe: !!item.subRecipeId,
      quantity: item.quantity.toString(),
      unitLabel: UNIT_LABELS[item.unit as UnitValue],
      unitCost: unitCost ? formatMoney(unitCost.toNumber(), 4) : null,
      lineCost: lineCost ? formatMoney(lineCost.toNumber()) : null,
    };
  });

  const sellingPrice = recipe.sellingPrice ? Number(recipe.sellingPrice) : null;
  const costPct =
    totalCost && !costError && sellingPrice && sellingPrice > 0
      ? totalCost.dividedBy(sellingPrice).times(100).toFixed(1)
      : null;
  const costPerYieldUnit =
    totalCost && !costError && !recipe.yieldQty.isZero()
      ? formatMoney(totalCost.dividedBy(recipe.yieldQty).toNumber(), 4)
      : null;

  const buffer = await buildRecipePdf({
    name: recipe.name,
    categoryName: recipe.category?.name ?? null,
    yieldQty: recipe.yieldQty.toString(),
    yieldUnitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
    isMenuItem: recipe.isMenuItem,
    sellingPrice: sellingPrice !== null ? formatMoney(sellingPrice) : null,
    instructions: recipe.instructions,
    totalCost: totalCost ? formatMoney(totalCost.toNumber()) : null,
    costError,
    costPerYieldUnit,
    costPct,
    items,
    photo: recipe.photo ? Buffer.from(recipe.photo) : null,
  });

  const safeName = recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receta-${safeName || recipe.id}.pdf"`,
    },
  });
}
