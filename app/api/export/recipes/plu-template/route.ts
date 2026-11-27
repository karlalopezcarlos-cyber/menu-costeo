import { NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildPluTemplateWorkbook } from "@/lib/excel/export-plu-template";

export async function GET() {
  const user = await requireSucursalContext();

  const categories = await prisma.recipeCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const buffer = await buildPluTemplateWorkbook(categories.map((c) => c.name));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-plu.xlsx"`,
    },
  });
}
