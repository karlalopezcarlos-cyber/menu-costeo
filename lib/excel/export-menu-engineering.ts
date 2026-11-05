import ExcelJS from "exceljs";
import { CLASSIFICATION_LABELS, type IvaMode, type MenuEngineeringRow } from "@/lib/menu-engineering";
import { excelSheetName } from "@/lib/excel/sheet-name";

export async function buildMenuEngineeringWorkbook(
  rows: MenuEngineeringRow[],
  fromDate: Date,
  toDate: Date,
  ivaMode: IvaMode,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // El periodo no cabe en el nombre de la pestana (Excel corta en 31 y lo dejaba partido a la
  // mitad, "Ingenieria de menu (1-10-2026 a"). Ya va completo en el nombre del archivo.
  const sheet = workbook.addWorksheet(excelSheetName("Ingenieria de menu"));

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
    { header: "Costo unitario", key: "cost", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Costo total", key: "totalCost", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Margen unitario", key: "margin", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Margen total", key: "totalMargin", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Costo %", key: "costPct", width: 12 },
    { header: "% Popularidad", key: "popularity", width: 16 },
    { header: "Clasificacion", key: "classification", width: 20 },
    { header: "Por que no se pudo costear", key: "costIssues", width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      recipeName: row.recipeName,
      quantitySold: Number(row.quantitySold),
      grossUnitPrice: Number(row.grossUnitPrice),
      unitPrice: Number(row.unitPrice),
      cost: Number(row.cost),
      totalCost: Number(row.totalCost),
      margin: Number(row.margin),
      totalMargin: Number(row.totalMargin),
      costPct: row.costPct ? Number(row.costPct.toFixed(2)) : "",
      popularity: Number(row.popularity.times(100).toFixed(2)),
      classification: row.classification ? CLASSIFICATION_LABELS[row.classification] : "Revisar receta",
      costIssues: row.costIssues.join(" "),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
