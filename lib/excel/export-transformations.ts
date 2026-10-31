import ExcelJS from "exceljs";
import type { TransformationRow } from "@/lib/portioning/query";

const MONEY_FMT = '"$"#,##0.00';
const MONEY4_FMT = '"$"#,##0.0000';
const PCT_FMT = "0.00%";

/**
 * Un renglon por salida, repitiendo los datos de la entrada.
 *
 * Asi se puede filtrar por producto de salida y sumar costos en la hoja sin tener que desarmar
 * una celda con varias lineas adentro, que es como se ve en pantalla.
 */
export async function buildTransformationsWorkbook(rows: TransformationRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transformaciones");

  sheet.columns = [
    { header: "Folio", key: "folio", width: 12 },
    { header: "Fecha", key: "date", width: 12 },
    { header: "Entro", key: "input", width: 34 },
    { header: "Cantidad", key: "inputQty", width: 12 },
    { header: "Unidad", key: "inputUnit", width: 9 },
    { header: "Costo de entrada", key: "inputCost", width: 16 },
    { header: "Salio", key: "output", width: 34 },
    { header: "Cantidad", key: "outputQty", width: 12 },
    { header: "Unidad", key: "outputUnit", width: 9 },
    { header: "Costo unitario", key: "outputUnitCost", width: 15 },
    { header: "Costo de salida", key: "outputCost", width: 16 },
    { header: "Rendimiento", key: "yield", width: 13 },
    { header: "Comentario", key: "comment", width: 40 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFF0EDE8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

  for (const row of rows) {
    // Una transformacion sin salidas capturadas sigue saliendo, con las columnas de salida en
    // blanco: esconderla haria que los totales de entrada no cuadraran con la pantalla.
    const outputs = row.outputs.length > 0 ? row.outputs : [null];
    for (const [index, output] of outputs.entries()) {
      const primera = index === 0;
      sheet.addRow({
        folio: row.folioLabel,
        date: row.dateLabel,
        input: primera ? row.productName : "",
        inputQty: primera ? row.initialQty : "",
        inputUnit: primera ? row.initialUnitLabel : "",
        inputCost: primera ? row.initialCost : "",
        output: output?.name ?? "",
        outputQty: output ? output.qty : "",
        outputUnit: output?.unitLabel ?? "",
        outputUnitCost: output && output.unitCost > 0 ? output.unitCost : "",
        outputCost: output && output.unitCost > 0 ? output.qty * output.unitCost : "",
        yield: primera ? row.yieldPct / 100 : "",
        comment: primera ? (row.comment ?? "") : "",
      });
    }
  }

  for (let i = 2; i <= sheet.rowCount; i++) {
    const excelRow = sheet.getRow(i);
    excelRow.getCell("inputCost").numFmt = MONEY_FMT;
    excelRow.getCell("outputUnitCost").numFmt = MONEY4_FMT;
    excelRow.getCell("outputCost").numFmt = MONEY_FMT;
    excelRow.getCell("yield").numFmt = PCT_FMT;
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: 13 } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
