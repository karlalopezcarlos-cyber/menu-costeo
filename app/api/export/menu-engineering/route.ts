import { NextRequest, NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { computeMenuEngineeringReport, type IvaMode } from "@/lib/menu-engineering";
import { buildMenuEngineeringWorkbook } from "@/lib/excel/export-menu-engineering";

export async function GET(request: NextRequest) {
  const user = await requireSucursalContext();

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00Z`) : defaultFrom;
  const toDate = toParam ? new Date(`${toParam}T00:00:00Z`) : defaultTo;
  const ivaMode: IvaMode = request.nextUrl.searchParams.get("iva") === "sin" ? "sin" : "con";

  const rows = await computeMenuEngineeringReport(user.sucursalId, fromDate, toDate, ivaMode);
  const buffer = await buildMenuEngineeringWorkbook(rows, fromDate, toDate, ivaMode);

  const fileLabel = `${fromDate.toISOString().slice(0, 10)}_${toDate.toISOString().slice(0, 10)}`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ingenieria-menu-${fileLabel}.xlsx"`,
    },
  });
}
