import ExcelJS from "exceljs";
import type { KardexRow } from "@/lib/kardex";

/**
 * El kardex tal como se ve en pantalla, con entradas y salidas en columnas separadas para poder
 * sumarlas en la hoja, y el saldo corrido cuando se exporta un solo producto (si son varios, un
 * saldo mezclado no significaria nada).
 */
export async function buildKardexWorkbook(
  rows: KardexRow[],
  options: { openingQty: number | null; openingLabel: string | null; productName: string | null },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Kardex");

  const conSaldo = options.openingQty !== null;

  sheet.columns = [
    { header: "Fecha", key: "date", width: 12 },
    { header: "Hora de captura", key: "time", width: 16 },
    { header: "Producto", key: "product", width: 34 },
    { header: "Unidad", key: "unit", width: 9 },
    { header: "Movimiento", key: "type", width: 24 },
    { header: "Folio", key: "reference", width: 16 },
    { header: "Detalle", key: "detail", width: 40 },
    { header: "Entrada", key: "qtyIn", width: 12 },
    { header: "Salida", key: "qtyOut", width: 12 },
    ...(conSaldo ? [{ header: "Saldo", key: "balance", width: 12 }] : []),
    { header: "Usuario", key: "user", width: 24 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFF0EDE8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  let balance = options.openingQty ?? 0;
  if (conSaldo) {
    const inicial = sheet.addRow({
      product: options.productName ?? "",
      type: "Saldo inicial",
      detail: options.openingLabel ?? "",
      balance,
    });
    inicial.font = { bold: true };
  }

  for (const row of rows) {
    balance += row.qtyDelta;
    sheet.addRow({
      date: row.dateLabel,
      time: row.timeLabel,
      product: row.productName,
      unit: row.unitLabel,
      type: row.typeLabel,
      reference: row.reference,
      detail: row.detail,
      qtyIn: row.qtyDelta > 0 ? row.qtyDelta : "",
      qtyOut: row.qtyDelta < 0 ? -row.qtyDelta : "",
      ...(conSaldo ? { balance } : {}),
      user: row.userName ?? "",
    });
  }

  if (conSaldo) {
    const final = sheet.addRow({ type: "Saldo final", balance });
    final.font = { bold: true };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: sheet.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
