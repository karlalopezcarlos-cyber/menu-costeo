import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildProductsWorkbook, type ProductExportRow } from "@/lib/excel/export-products";
import type { UnitValue } from "@/lib/units";

export async function GET(request: NextRequest) {
  const user = await requireOrgSession();

  const showArchived = request.nextUrl.searchParams.get("view") === "archived";

  const products = await prisma.product.findMany({
    where: {
      organizationId: user.organizationId,
      archivedAt: showArchived ? { not: null } : null,
    },
    orderBy: { name: "asc" },
    include: { category: true },
  });

  const rows: ProductExportRow[] = products.map((product) => ({
    name: product.name,
    category: product.category?.name ?? null,
    baseUnit: product.baseUnit as UnitValue,
    yieldPercentage: product.yieldPercentage.toString(),
    currentUnitCost: product.currentUnitCost.toString(),
    hasPurchases: product.currentUnitCostUpdatedAt !== null,
    archived: product.archivedAt !== null,
  }));

  const buffer = await buildProductsWorkbook(rows);
  const fileName = showArchived ? "productos-archivados.xlsx" : "productos.xlsx";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
