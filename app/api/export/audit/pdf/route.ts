import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { computeInventoryAudit, filterAuditRows, sumVarianceAmounts, type AuditRowFilters } from "@/lib/audit";
import { buildAuditPdf, type AuditPdfRow } from "@/lib/pdf/export-audit";

function fmtQty(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

export async function GET(request: NextRequest) {
  const user = await requireOrgSession();
  const params = request.nextUrl.searchParams;

  const initialCountId = params.get("initial");
  if (!initialCountId) {
    return NextResponse.json({ error: "Falta el inventario inicial." }, { status: 400 });
  }
  const finalCountId = params.get("final");

  const filters: AuditRowFilters = {
    search: params.get("search") ?? "",
    typeFilter: (params.get("type") as AuditRowFilters["typeFilter"]) ?? "all",
    categoryFilter: params.get("category") ?? "all",
    onlyDifferences: params.get("onlyDifferences") === "true",
    onlyWithComment: params.get("onlyWithComment") === "true",
  };

  const [result, organization] = await Promise.all([
    computeInventoryAudit(user.organizationId, initialCountId, finalCountId || null),
    prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
  ]);

  const filteredRows = filterAuditRows(result.rows, filters);
  const { totalShortageAmount, totalSurplusAmount } = sumVarianceAmounts(filteredRows);

  const filtersSummary: string[] = [];
  if (filters.search) filtersSummary.push(`Busqueda: "${filters.search}"`);
  if (filters.typeFilter !== "all") {
    filtersSummary.push(filters.typeFilter === "product" ? "Solo productos" : "Solo subrecetas");
  }
  if (filters.categoryFilter !== "all") {
    filtersSummary.push(`Categoria: ${filters.categoryFilter === "none" ? "Sin categoria" : filters.categoryFilter}`);
  }
  if (filters.onlyDifferences) filtersSummary.push("Solo con movimiento o variacion");
  if (filters.onlyWithComment) filtersSummary.push("Solo con comentario en la variacion");

  const pdfRows: AuditPdfRow[] = filteredRows.map((row) => ({
    categoryName: row.categoryName,
    itemType: row.itemType,
    name: row.name,
    unitLabel: row.unitLabel,
    theoreticalLabel: fmtQty(row.theoreticalFinalQty),
    actualLabel: row.actualFinalQty !== null ? `${fmtQty(row.actualFinalQty)} ${row.unitLabel}` : "-",
    varianceLabel:
      row.varianceQty !== null ? `${row.varianceQty > 0 ? "+" : ""}${fmtQty(row.varianceQty)} ${row.unitLabel}` : "-",
    previousVarianceLabel:
      row.previousVarianceQty !== null
        ? `${row.previousVarianceQty > 0 ? "+" : ""}${fmtQty(row.previousVarianceQty)} ${row.unitLabel}`
        : "-",
    varianceAmount: row.varianceAmount,
    variancePct: row.variancePct,
    comment: row.comment,
  }));

  const buffer = await buildAuditPdf({
    organizationName: organization?.name ?? "",
    initialDateLabel: result.initialDateLabel,
    finalDateLabel: result.finalDateLabel,
    filtersSummary,
    totalShortageAmount,
    totalSurplusAmount,
    rows: pdfRows,
  });

  const fileLabel = `${result.initialDateLabel}${result.finalDateLabel ? `_${result.finalDateLabel}` : ""}`.replace(
    /\//g,
    "-",
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="auditoria-inventario-${fileLabel}.pdf"`,
    },
  });
}
