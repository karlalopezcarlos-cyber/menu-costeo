import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, resolveRecipeCost } from "@/lib/costing";
import {
  buildRecipeCostsTemplateWorkbook,
  type RecipeCostTemplateRow,
} from "@/lib/excel/export-recipe-costs-template";

const ORIGEN_LEGIBLE: Record<string, string> = {
  calculado: "De la receta",
  capturado: "Capturado a mano",
  incompleto: "Sin costo confiable",
};

export async function GET() {
  const user = await requireSucursalContext();

  const recipes = await prisma.recipe.findMany({
    where: { sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sellingPrice: true, manualCost: true },
  });

  const graph = await loadOrgRecipeGraph(user.sucursalId);
  const memo = new Map<string, Decimal>();

  const rows: RecipeCostTemplateRow[] = recipes.map((recipe) => {
    let calculatedCost: number | null = null;
    let origin = "incompleto";
    try {
      const resuelto = resolveRecipeCost(recipe.id, graph, memo);
      calculatedCost = resuelto.total.toNumber();
      origin = resuelto.origin;
    } catch {
      // Una receta circular o con datos corruptos no debe tumbar la plantilla entera: se baja
      // con la celda vacia y quien la llene vera que a ese platillo le falta costo.
    }
    return {
      recipeName: recipe.name,
      calculatedCost,
      manualCost: recipe.manualCost ? Number(recipe.manualCost) : null,
      sellingPrice: recipe.sellingPrice ? Number(recipe.sellingPrice) : null,
      origin: ORIGEN_LEGIBLE[origin] ?? "Sin costo confiable",
    };
  });

  const buffer = await buildRecipeCostsTemplateWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-costos.xlsx"`,
    },
  });
}
