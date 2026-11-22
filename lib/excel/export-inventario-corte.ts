import ExcelJS from "exceljs";
import type { CorteRow } from "@/lib/kardex-types";

/**
 * El inventario teorico al corte: cuanto deberia haber de cada producto a una fecha y cuanto
 * vale. Se baja completo (no solo lo que se ve en pantalla) porque el uso normal es imprimirlo
 * para salir a contar y escribir al lado lo que de verdad hay.
 */
export async function buildInventarioCorteWorkbook(
  rows: CorteRow[],
  options: { fecha: string; basisLabel: string; sucursalName: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario al corte");

  // Dos renglones de contexto antes de la tabla: un saldo teorico sin la fecha y sin el conteo
  // del que cuelga se malinterpreta como si fuera un conteo real.
  sheet.addRow([`Inventario teorico al ${options.fecha} — ${options.sucursalName}`]);
  sheet.addRow([`Parte de: ${options.basisLabel}`]);
  sheet.addRow([]);
  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.getRow(2).font = { italic: true, color: { argb: "FF6B6B6B" } };

  const encabezados = sheet.addRow([
    "Producto",
    "Unidad",
    "Ultimo conteo",
    "Movimientos",
    "Saldo teorico",
    "Costo unitario",
    "Valor",
    "Conteo fisico",
    "Diferencia",
  ]);
  encabezados.font = { bold: true, color: { argb: "FFF0EDE8" } };
  encabezados.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  encabezados.height = 20;
  const filaEncabezado = encabezados.number;

  sheet.columns = [
    { key: "product", width: 36 },
    { key: "unit", width: 9 },
    { key: "base", width: 14 },
    { key: "movimientos", width: 14 },
    { key: "saldo", width: 14 },
    { key: "unitCost", width: 15, style: { numFmt: '"$"#,##0.0000' } },
    { key: "valor", width: 14, style: { numFmt: '"$"#,##0.00' } },
    { key: "fisico", width: 14 },
    { key: "diferencia", width: 14 },
  ];

  for (const row of rows) {
    const añadida = sheet.addRow({
      product: row.productName,
      unit: row.unitLabel,
      base: row.base,
      movimientos: row.movimientos,
      saldo: row.saldo,
      unitCost: row.unitCost,
      valor: row.valor,
    });
    // La diferencia se calcula en la hoja: asi quien sale a contar escribe el fisico y la
    // columna se llena sola, sin volver a la app.
    añadida.getCell("diferencia").value = {
      formula: `IF(H${añadida.number}="","",H${añadida.number}-E${añadida.number})`,
    };
  }

  const primera = filaEncabezado + 1;
  const ultima = sheet.rowCount;
  const total = sheet.addRow({ product: "Total" });
  total.font = { bold: true };
  if (ultima >= primera) {
    total.getCell("valor").value = { formula: `SUM(G${primera}:G${ultima})` };
  }

  sheet.views = [{ state: "frozen", ySplit: filaEncabezado }];
  sheet.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: ultima, column: 9 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
