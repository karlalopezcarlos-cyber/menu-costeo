import ExcelJS from "exceljs";
import type { IncomeStatementResult, IncomeStatementRowView } from "@/lib/income-statement";

const MONEY_FMT = '"$"#,##0.00';
const PCT_FMT = "0.00%";

function addDataRow(sheet: ExcelJS.Worksheet, row: IncomeStatementRowView) {
  const values = [row.label];
  const pairs: [number, number | null][] = [
    [row.alimento, row.alimentoPct],
    [row.bebidas, row.bebidasPct],
    [row.miscelaneos, row.miscelaneosPct],
    [row.consolidado, row.consolidadoPct],
  ];
  for (const [amount, pct] of pairs) {
    values.push(amount as unknown as string);
    values.push((pct !== null ? pct / 100 : null) as unknown as string);
  }
  const excelRow = sheet.addRow(values);
  if (row.bold) excelRow.font = { bold: true };
  for (let col = 2; col <= 8; col += 2) excelRow.getCell(col).numFmt = MONEY_FMT;
  for (let col = 3; col <= 9; col += 2) {
    if (row.pctMode !== "none") excelRow.getCell(col).numFmt = PCT_FMT;
  }
  return excelRow;
}

export async function buildIncomeStatementWorkbook(
  result: IncomeStatementResult,
  rows: IncomeStatementRowView[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Estado de Resultados");

  sheet.getColumn(1).width = 34;
  for (let col = 2; col <= 9; col++) sheet.getColumn(col).width = 13;

  sheet.addRow([`${result.organizationName} - ${result.sucursalName}`]).font = { bold: true, size: 12 };
  sheet.addRow([`${result.initialDateLabel} - ${result.finalDateLabel}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    "Concepto",
    "Alimento",
    "%",
    "Bebidas",
    "%",
    "Miscelaneos",
    "%",
    "Consolidado",
    "%",
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF262626" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  // Ventas / Salidas / Venta total
  addDataRow(sheet, rows[0]);
  addDataRow(sheet, rows[1]);
  addDataRow(sheet, rows[2]);
  sheet.addRow([]);

  // Inventario inicial .. Variacion
  for (let i = 3; i < rows.length; i++) addDataRow(sheet, rows[i]);
  sheet.addRow([]);

  const pagadoRow = sheet.addRow(["Monto pagado", "", "", "", "", "", "", result.montoPagado, ""]);
  pagadoRow.getCell(8).numFmt = MONEY_FMT;

  const promedioRow = sheet.addRow([
    "Venta promedio diaria",
    "",
    "",
    "",
    "",
    "",
    "",
    result.ventaPromedioDiaria.consolidado,
    "",
  ]);
  promedioRow.font = { bold: true };
  promedioRow.getCell(8).numFmt = MONEY_FMT;

  sheet.addRow([`${result.diasActivos} dias activos (con venta registrada) en el periodo.`]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
