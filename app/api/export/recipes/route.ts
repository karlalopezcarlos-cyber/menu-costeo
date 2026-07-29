import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { buildRecipesWorkbook, type RecipeExportRow } from "@/lib/excel/export-recipes";
import type { UnitValue } from "@/lib/units";

export async function GET() {
  const user = await requireOrgSession();

  const [graph, recipes] = await Promise.all([
    loadOrgRecipeGraph(user.organizationId),
    prisma.recipe.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { category: true },
    }),
  ]);
  const memo = new Map<string, Decimal>();

  const rows: RecipeExportRow[] = recipes.map((recipe) => {
    let cost = new Decimal(0);
    try {
      cost = getRecipeCost(recipe.id, graph, memo);
    } catch {
      cost = new Decimal(0);
    }
    const yieldQty = new Decimal(recipe.yieldQty);
    return {
      name: recipe.name,
      category: recipe.category?.name ?? null,
      yieldQty: yieldQty.toString(),
      yieldUnit: recipe.yieldUnit as UnitValue,
      isMenuItem: recipe.isMenuItem,
      sellingPrice: recipe.sellingPrice ? recipe.sellingPrice.toString() : null,
      totalCost: cost.toString(),
      costPerYieldUnit: yieldQty.isZero() ? "0" : cost.dividedBy(yieldQty).toString(),
    };
  });

  const buffer = await buildRecipesWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="recetas.xlsx"',
    },
  });
}
