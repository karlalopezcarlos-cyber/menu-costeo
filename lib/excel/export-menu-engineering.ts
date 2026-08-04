import ExcelJS from "exceljs";
import { CLASSIFICATION_LABELS, type IvaMode, type MenuEngineeringRow } from "@/lib/menu-engineering";

export async function buildMenuEngineeringWorkbook(
  rows: MenuEngineeringRow[],
  fromDate: Date,
  toDate: Date,
  ivaMode: IvaMode,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const periodLabel = `${fromDate.toLocaleDateString("es-MX", { timeZone: "UTC" })} a ${toDate.toLocaleDateString("es-MX", { timeZone: "UTC" })}`;
  const sheet = workbook.addWorksheet(`Ingenieria de menu (${periodLabel})`.slice(0, 31));

  sheet.columns = [
    { header: "Platillo", key: "recipeName", width: 30 },
    { header: "Cantidad vendida", key: "quantitySold", width: 16 },
    { header: "Precio de venta (con IVA)", key: "grossUnitPrice", width: 20, style: { numFmt: '"$"#,##0.00' } },
    {
      header: ivaMode === "sin" ? "Precio de venta (sin IVA)" : "Precio de venta",
      key: "unitPrice",
      width: 20,
      style: { numFmt: '"$"#,##0.00' },
    },
    { header: "Costo", key: "cost", width: 14, style: { numFmt: '"$"#,##0.00' } },
    { header: "Margen", key: "margin", width: 14, style: { numFmt: '"$"#,##0.00' } },
    { header: "Costo %", key: "costPct", width: 12 },
    { header: "% Popularidad", key: "popularity", width: 16 },
    { header: "Clasificacion", key: "classification", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      recipeName: row.recipeName,
      quantitySold: Number(row.quantitySold),
      grossUnitPrice: Number(row.grossUnitPrice),
      unitPrice: Number(row.unitPrice),
      cost: Number(row.cost),
      margin: Number(row.margin),
      costPct: row.costPct ? Number(row.costPct.toFixed(2)) : "",
      popularity: Number(row.popularity.times(100).toFixed(2)),
      classification: CLASSIFICATION_LABELS[row.classification],
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
