import { NextRequest, NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { computeInventoryAudit } from "@/lib/audit";
import { buildAuditWorkbook } from "@/lib/excel/export-audit";

export async function GET(request: NextRequest) {
  const user = await requireSucursalContext();

  const initialCountId = request.nextUrl.searchParams.get("initial");
  const finalCountId = request.nextUrl.searchParams.get("final");

  if (!initialCountId) {
    return NextResponse.json({ error: "Falta el inventario inicial." }, { status: 400 });
  }

  const result = await computeInventoryAudit(
    user.organizationId,
    user.sucursalId,
    initialCountId,
    finalCountId || null,
  );
  const buffer = await buildAuditWorkbook(result.rows, result.initialDateLabel, result.finalDateLabel);

  const fileLabel = `${result.initialDateLabel}${result.finalDateLabel ? `_${result.finalDateLabel}` : ""}`.replace(
    /\//g,
    "-",
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="auditoria-inventario-${fileLabel}.xlsx"`,
    },
  });
}
