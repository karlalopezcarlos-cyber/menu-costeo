import { NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildSalesTemplateWorkbook, type SalesTemplateRow } from "@/lib/excel/export-sales-template";

export async function GET() {
  const user = await requireSucursalContext();

  const recipes = await prisma.recipe.findMany({
    where: { sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
    orderBy: { name: "asc" },
    select: { name: true, sellingPrice: true },
  });

  const rows: SalesTemplateRow[] = recipes.map((recipe) => ({
    recipeName: recipe.name,
    sellingPrice: recipe.sellingPrice ? recipe.sellingPrice.toString() : null,
  }));

  const buffer = await buildSalesTemplateWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-ventas.xlsx"`,
    },
  });
}
