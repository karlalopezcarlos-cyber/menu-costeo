import { NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildProductsTemplateWorkbook } from "@/lib/excel/export-products-template";

export async function GET() {
  const user = await requireOrgSession();

  const [categories, suppliers] = await Promise.all([
    prisma.productCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const buffer = await buildProductsTemplateWorkbook(
    categories.map((c) => c.name),
    suppliers.map((s) => s.name),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-productos.xlsx"`,
    },
  });
}
