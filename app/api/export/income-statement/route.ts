import { NextRequest, NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { computeIncomeStatement, buildIncomeStatementRows } from "@/lib/income-statement";
import { buildIncomeStatementWorkbook } from "@/lib/excel/export-income-statement";

export async function GET(request: NextRequest) {
  const user = await requireSucursalContext();

  const initialCountId = request.nextUrl.searchParams.get("initial");
  const finalCountId = request.nextUrl.searchParams.get("final");

  if (!initialCountId || !finalCountId) {
    return NextResponse.json({ error: "Faltan las fechas del periodo." }, { status: 400 });
  }

  const result = await computeIncomeStatement(user.organizationId, user.sucursalId, initialCountId, finalCountId);
  const rows = buildIncomeStatementRows(result);
  const buffer = await buildIncomeStatementWorkbook(result, rows);

  const fileLabel = `${result.initialDateLabel}_${result.finalDateLabel}`.replace(/\//g, "-");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="estado-de-resultados-${fileLabel}.xlsx"`,
    },
  });
}
