import ExcelJS from "exceljs";
import type { AuditRow } from "@/lib/audit";

function fmtQty(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/** Ej. "150 ML" -> "150 ML (0.20 Botella)" cuando el producto tiene presentacion fija configurada. */
function presentationSuffix(row: AuditRow, qty: number): string {
  if (!row.presentationUnitQty) return "";
  const count = qty / row.presentationUnitQty;
  return ` (${count.toFixed(2)} ${row.presentationUnitLabel})`;
}

function plainCell(row: AuditRow, qty: number): string {
  return `${fmtQty(qty)} ${row.unitLabel}${presentationSuffix(row, qty)}`;
}

function positiveCell(row: AuditRow, qty: number): string {
  return qty === 0 ? "" : `+${fmtQty(qty)} ${row.unitLabel}${presentationSuffix(row, qty)}`;
}

function negativeCell(row: AuditRow, qty: number): string {
  return qty === 0 ? "" : `-${fmtQty(qty)} ${row.unitLabel}${presentationSuffix(row, qty)}`;
}

function signedCell(row: AuditRow, qty: number): string {
  return `${qty > 0 ? "+" : ""}${fmtQty(qty)} ${row.unitLabel}${presentationSuffix(row, qty)}`;
}

export async function buildAuditWorkbook(
  rows: AuditRow[],
  initialLabel: string,
  finalLabel: string | null,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const periodLabel = `${initialLabel}${finalLabel ? ` a ${finalLabel}` : ""}`.replace(/[*?:\\/[\]]/g, "-");
  const sheet = workbook.addWorksheet(`Auditoria (${periodLabel})`.slice(0, 31));

  sheet.columns = [
    { header: "Categoria", key: "category", width: 18 },
    { header: "Tipo", key: "type", width: 12 },
    { header: "Nombre", key: "name", width: 30 },
    { header: "Inicial", key: "initial", width: 22 },
    { header: "+ Compras", key: "purchases", width: 22 },
    { header: "+ Produccion", key: "produced", width: 18 },
    { header: "- Mermas", key: "waste", width: 22 },
    { header: "- Produccion", key: "productionConsumed", width: 22 },
    { header: "- Ventas", key: "sales", width: 22 },
    { header: "= Teorico", key: "theoretical", width: 24 },
    { header: "Real (final)", key: "actual", width: 24 },
    { header: "Variacion", key: "variance", width: 24 },
    { header: "Variacion anterior", key: "previousVariance", width: 24 },
    { header: "Variacion $", key: "varianceAmount", width: 14 },
    { header: "Variacion %", key: "variancePct", width: 12 },
    { header: "Comentario", key: "comment", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("varianceAmount").numFmt = '"$"#,##0.00';

  for (const row of rows) {
    sheet.addRow({
      category: row.categoryName ?? "",
      type: row.itemType === "product" ? "Producto" : "Subreceta",
      name: row.name,
      initial: plainCell(row, row.initialQty),
      purchases: positiveCell(row, row.purchasesQty),
      produced: positiveCell(row, row.producedQty),
      waste: negativeCell(row, row.wasteQty),
      productionConsumed: negativeCell(row, row.productionConsumedQty),
      sales: negativeCell(row, row.salesQty),
      theoretical: plainCell(row, row.theoreticalFinalQty),
      actual: row.actualFinalQty !== null ? plainCell(row, row.actualFinalQty) : "",
      variance: row.varianceQty !== null ? signedCell(row, row.varianceQty) : "",
      previousVariance: row.previousVarianceQty !== null ? signedCell(row, row.previousVarianceQty) : "",
      varianceAmount: row.varianceAmount !== null ? Number(row.varianceAmount.toFixed(2)) : "",
      variancePct: row.variancePct !== null ? Number(row.variancePct.toFixed(1)) : "",
      comment: row.comment ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
