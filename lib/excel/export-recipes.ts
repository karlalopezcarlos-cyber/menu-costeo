import ExcelJS from "exceljs";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";

export type RecipeExportRow = {
  name: string;
  category: string | null;
  yieldQty: string;
  yieldUnit: UnitValue;
  isMenuItem: boolean;
  sellingPrice: string | null;
  totalCost: string;
  costPerYieldUnit: string;
};

export async function buildRecipesWorkbook(rows: RecipeExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Recetas");

  sheet.columns = [
    { header: "Nombre", key: "name", width: 30 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "Rendimiento", key: "yieldQty", width: 14 },
    { header: "Unidad de rendimiento", key: "yieldUnit", width: 20 },
    { header: "Platillo de menu", key: "isMenuItem", width: 16 },
    { header: "Precio de venta", key: "sellingPrice", width: 16, style: { numFmt: '"$"#,##0.00' } },
    { header: "Costo total", key: "totalCost", width: 14, style: { numFmt: '"$"#,##0.00' } },
    {
      header: "Costo por unidad de rendimiento",
      key: "costPerYieldUnit",
      width: 26,
      style: { numFmt: '"$"#,##0.0000' },
    },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      category: row.category ?? "",
      yieldQty: Number(row.yieldQty),
      yieldUnit: UNIT_LABELS[row.yieldUnit],
      isMenuItem: row.isMenuItem ? "Si" : "No",
      sellingPrice: row.sellingPrice ? Number(row.sellingPrice) : "",
      totalCost: Number(row.totalCost),
      costPerYieldUnit: Number(row.costPerYieldUnit),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
