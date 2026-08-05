import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost, type RecipeGraph } from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import {
  buildRecipeIngredientsWorkbook,
  type RecipeIngredientExportRow,
} from "@/lib/excel/export-recipe-ingredients";

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
      return perUnit.times(graph.productCosts.get(item.productId) ?? new Decimal(0));
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

export async function GET() {
  const user = await requireSucursalContext();

  const recipes = await prisma.recipe.findMany({
    where: { sucursalId: user.sucursalId, archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { product: true, subRecipe: true } },
    },
  });

  const graph = await loadOrgRecipeGraph(user.sucursalId);
  const memo = new Map<string, Decimal>();

  const rows: RecipeIngredientExportRow[] = [];

  for (const recipe of recipes) {
    let totalCost: Decimal | null = null;
    try {
      totalCost = getRecipeCost(recipe.id, graph, memo);
    } catch {
      totalCost = null;
    }
    const recipeCost = totalCost ? totalCost.toFixed(2) : null;
    const recipeType = recipe.isMenuItem ? "PLU" : "Subreceta";
    const yieldLabel = `${recipe.yieldQty.toString()} ${UNIT_LABELS[recipe.yieldUnit as UnitValue]}`;
    const costPerUnit =
      totalCost && !recipe.yieldQty.isZero() ? totalCost.dividedBy(recipe.yieldQty).toFixed(4) : null;

    if (recipe.items.length === 0) {
      rows.push({
        recipeName: recipe.name,
        recipeType,
        yieldLabel,
        ingredientName: "-",
        quantity: "-",
        unitLabel: "-",
        unitPrice: null,
        total: null,
        recipeCost,
        costPerUnit,
      });
      continue;
    }

    for (const item of recipe.items) {
      const unitCost = computeUnitCost(item, item.product, item.subRecipe, graph, memo);
      const lineCost = unitCost ? unitCost.times(item.quantity) : null;
      const label = item.product?.name ?? item.subRecipe?.name ?? "?";

      rows.push({
        recipeName: recipe.name,
        recipeType,
        yieldLabel,
        ingredientName: label,
        quantity: item.quantity.toString(),
        unitLabel: UNIT_LABELS[item.unit as UnitValue],
        unitPrice: unitCost ? unitCost.toFixed(4) : null,
        total: lineCost ? lineCost.toFixed(2) : null,
        recipeCost,
        costPerUnit,
      });
    }
  }

  const buffer = await buildRecipeIngredientsWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="recetas-ingredientes.xlsx"`,
    },
  });
}
