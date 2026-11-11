import { NextRequest, NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { computeIncomeStatement, buildIncomeStatementRows, type IvaView } from "@/lib/income-statement";
import { buildIncomeStatementWorkbook } from "@/lib/excel/export-income-statement";

export async function GET(request: NextRequest) {
  const user = await requireSucursalContext();

  // La puerta real es esta, no el boton. Esconderlo en el Panel es cortesia; cualquiera puede
  // escribir la URL de este endpoint a mano, y entonces lo unico que lo detiene es este if.
  if (!hasPermission(user.role, user.permissions, "EXPORT_INCOME_STATEMENT")) {
    return NextResponse.json(
      { error: "No tienes permiso para descargar el Estado de Resultados." },
      { status: 403 },
    );
  }

  const initialCountId = request.nextUrl.searchParams.get("initial");
  const finalCountId = request.nextUrl.searchParams.get("final");

  if (!initialCountId || !finalCountId) {
    return NextResponse.json({ error: "Faltan las fechas del periodo." }, { status: 400 });
  }

  // La misma vista que se eligio en pantalla: un PDF que dice otra cosa que la tabla de la
  // que salio es peor que no tenerlo.
  const ivaView: IvaView = request.nextUrl.searchParams.get("iva") === "con" ? "conIva" : "sinIva";

  const result = await computeIncomeStatement(
    user.organizationId,
    user.sucursalId,
    initialCountId,
    finalCountId,
    ivaView,
  );
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
