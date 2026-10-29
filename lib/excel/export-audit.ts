import ExcelJS from "exceljs";
import type { AuditRow } from "@/lib/audit";

const QTY_FMT = "#,##0.00";
const MONEY_FMT = '"$"#,##0.0000';

/**
 * Auditoria de diferencias, pensada para seguir trabajando el archivo.
 *
 * Todas las cantidades van como numero puro, sin la unidad pegada: antes decian "0.34 PZA
 * (0.00 Botella)" y eso se ve bien en pantalla pero no se puede sumar ni restar. La unidad
 * ahora es una columna propia, y el costo unitario otra, para poder explicar de donde sale el
 * valor del inventario sin salirse del archivo.
 */
export async function buildAuditWorkbook(
  rows: AuditRow[],
  initialLabel: string,
  finalLabel: string | null,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const periodLabel = `${initialLabel}${finalLabel ? ` a ${finalLabel}` : ""}`.replace(/[*?:\\/[\]]/g, "-");
  const sheet = workbook.addWorksheet(`Auditoria (${periodLabel})`.slice(0, 31));

  sheet.columns = [
    { header: "Grupo", key: "costGroup", width: 16 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "Tipo", key: "type", width: 11 },
    { header: "Nombre", key: "name", width: 32 },
    { header: "Unidad", key: "unit", width: 9 },
    { header: "Costo unitario", key: "unitCost", width: 14 },
    { header: "Inicial", key: "initial", width: 12 },
    { header: "+ Compras", key: "purchases", width: 12 },
    { header: "+ Produccion", key: "produced", width: 13 },
    { header: "+ Transformacion", key: "transformedIn", width: 15 },
    { header: "- Mermas", key: "waste", width: 11 },
    { header: "- Produccion", key: "productionConsumed", width: 13 },
    { header: "- Transformacion", key: "transformedOut", width: 15 },
    { header: "- Ventas", key: "sales", width: 11 },
    { header: "= Teorico", key: "theoretical", width: 12 },
    { header: "Real (final)", key: "actual", width: 12 },
    { header: "Variacion", key: "variance", width: 12 },
    { header: "Variacion anterior", key: "previousVariance", width: 16 },
    { header: "Variacion $", key: "varianceAmount", width: 14 },
    { header: "Variacion %", key: "variancePct", width: 12 },
    { header: "Valor inventario", key: "inventoryValue", width: 16 },
    { header: "Comentario", key: "comment", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];

  for (const row of rows) {
    // Las salidas se guardan en negativo para que la fila se pueda sumar de corrido:
    // inicial + compras + produccion - mermas - produccion consumida - ventas = teorico.
    sheet.addRow({
      costGroup: row.costGroupName ?? "",
      category: row.categoryName ?? "",
      type: row.itemType === "product" ? "Producto" : "Subreceta",
      name: row.name,
      unit: row.unitLabel,
      unitCost: row.unitCost,
      initial: row.initialQty,
      purchases: row.purchasesQty || null,
      produced: row.producedQty || null,
      transformedIn: row.transformedInQty || null,
      waste: row.wasteQty ? -row.wasteQty : null,
      productionConsumed: row.productionConsumedQty ? -row.productionConsumedQty : null,
      transformedOut: row.transformedOutQty ? -row.transformedOutQty : null,
      sales: row.salesQty ? -row.salesQty : null,
      theoretical: row.theoreticalFinalQty,
      actual: row.actualFinalQty,
      variance: row.varianceQty,
      previousVariance: row.previousVarianceQty,
      varianceAmount: row.varianceAmount,
      variancePct: row.variancePct !== null ? Number(row.variancePct.toFixed(1)) : null,
      // Lo que vale lo que de verdad hay: por eso el costo unitario esta a la vista.
      inventoryValue: row.actualFinalQty !== null ? row.actualFinalQty * row.unitCost : null,
      comment: row.comment ?? "",
    });
  }

  for (const key of [
    "initial",
    "purchases",
    "produced",
    "transformedIn",
    "waste",
    "transformedOut",
    "productionConsumed",
    "sales",
    "theoretical",
    "actual",
    "variance",
    "previousVariance",
  ]) {
    sheet.getColumn(key).numFmt = QTY_FMT;
  }
  sheet.getColumn("unitCost").numFmt = MONEY_FMT;
  sheet.getColumn("varianceAmount").numFmt = '"$"#,##0.00';
  sheet.getColumn("inventoryValue").numFmt = '"$"#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
