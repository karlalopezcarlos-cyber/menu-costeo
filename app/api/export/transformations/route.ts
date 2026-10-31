import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import {
  buildTransformationWhere,
  toTransformationRow,
  TRANSFORMATION_INCLUDE,
} from "@/lib/portioning/query";
import { buildTransformationsWorkbook } from "@/lib/excel/export-transformations";

export async function GET(request: Request) {
  const user = await requireSucursalContext();
  const { searchParams } = new URL(request.url);

  // Sin parametros se exporta todo el historial: es el "descargar todo" de la pantalla, con los
  // mismos filtros que se vean ahi cuando los hay.
  const filters = {
    search: searchParams.get("q") ?? "",
    folio: searchParams.get("folio") ?? "",
    dateFrom: searchParams.get("from") ?? "",
    dateTo: searchParams.get("to") ?? "",
  };

  const entries = await prisma.portioningEntry.findMany({
    where: buildTransformationWhere(user.sucursalId, filters),
    orderBy: [{ date: "desc" }, { folio: "desc" }],
    include: TRANSFORMATION_INCLUDE,
  });

  const buffer = await buildTransformationsWorkbook(entries.map(toTransformationRow));

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="transformaciones.xlsx"`,
    },
  });
}
