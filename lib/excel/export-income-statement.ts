import ExcelJS from "exceljs";
import {
  buildIncomeStatementFooterRows,
  type IncomeStatementResult,
  type IncomeStatementRowView,
} from "@/lib/income-statement";

const MONEY_FMT = '"$"#,##0.00';
const PCT_FMT = "0.00%";

function addDataRow(sheet: ExcelJS.Worksheet, row: IncomeStatementRowView) {
  const values = [row.label];
  for (const cell of row.cells) {
    values.push(cell.amount as unknown as string);
    values.push((cell.pct !== null ? cell.pct / 100 : null) as unknown as string);
  }
  const excelRow = sheet.addRow(values);
  if (row.bold) excelRow.font = { bold: true };
  // Dos columnas por grupo (monto y %), tantas veces como grupos tenga la organizacion.
  const ultima = 1 + row.cells.length * 2;
  for (let col = 2; col <= ultima; col += 2) excelRow.getCell(col).numFmt = MONEY_FMT;
  for (let col = 3; col <= ultima; col += 2) {
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

  // Dos columnas (monto y %) por cada grupo de costo, mas el consolidado.
  const columnas = result.groups.length + 1;
  const ultimaColumna = 1 + columnas * 2;
  sheet.getColumn(1).width = 34;
  for (let col = 2; col <= ultimaColumna; col++) sheet.getColumn(col).width = 13;

  sheet.addRow([`${result.organizationName} - ${result.sucursalName}`]).font = { bold: true, size: 12 };
  sheet.addRow([`${result.initialDateLabel} - ${result.finalDateLabel}`]);
  sheet.addRow([]);

  // El encabezado sale de los grupos que definio la organizacion: antes estaba clavado en
  // Alimento/Bebidas/Miscelaneos y se desalineaba en cuanto alguien configuraba otros.
  const headerRow = sheet.addRow([
    "Concepto",
    ...[...result.groups.map((g) => g.name), "Consolidado"].flatMap((name) => [name, "%"]),
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

  // El pie: lo que no se reparte por grupo. Cae todo en la columna del consolidado.
  const montoCol = ultimaColumna - 1;
  for (const footer of buildIncomeStatementFooterRows(result)) {
    const values: (string | number)[] = [footer.label];
    for (let col = 2; col <= ultimaColumna; col++) values.push("");
    values[montoCol - 1] = footer.amount;
    if (footer.pct !== null) values[ultimaColumna - 1] = footer.pct / 100;

    const footerRow = sheet.addRow(values);
    if (footer.bold) footerRow.font = { bold: true };
    footerRow.getCell(montoCol).numFmt = MONEY_FMT;
    if (footer.pct !== null) footerRow.getCell(ultimaColumna).numFmt = PCT_FMT;
  }

  sheet.addRow([
    `${result.diasActivos} dias activos (con venta registrada) en el periodo. Los gastos no se reparten entre las columnas: son del negocio entero.`,
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
