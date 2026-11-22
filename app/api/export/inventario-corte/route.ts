import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { todayDateInputValue } from "@/lib/date-inputs";
import { computeInventarioAlCorte } from "@/lib/kardex";
import { buildInventarioCorteWorkbook } from "@/lib/excel/export-inventario-corte";

export async function GET(request: Request) {
  const user = await requireSucursalContext();
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("corte") || todayDateInputValue();

  const [corte, sucursal] = await Promise.all([
    computeInventarioAlCorte(user.organizationId, user.sucursalId, fecha),
    prisma.sucursal.findFirst({
      where: { id: user.sucursalId, organizationId: user.organizationId },
      select: { name: true },
    }),
  ]);

  const buffer = await buildInventarioCorteWorkbook(corte.rows, {
    fecha,
    basisLabel: corte.basisLabel,
    sucursalName: sucursal?.name ?? "",
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventario-al-${fecha}.xlsx"`,
    },
  });
}
