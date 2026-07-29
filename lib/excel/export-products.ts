import ExcelJS from "exceljs";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";

export type ProductExportRow = {
  name: string;
  category: string | null;
  baseUnit: UnitValue;
  yieldPercentage: string;
  currentUnitCost: string;
  hasPurchases: boolean;
  archived: boolean;
};

export async function buildProductsWorkbook(rows: ProductExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");

  sheet.columns = [
    { header: "Nombre", key: "name", width: 30 },
    { header: "Categoria", key: "category", width: 18 },
    { header: "Unidad base", key: "baseUnit", width: 16 },
    { header: "Rendimiento %", key: "yieldPercentage", width: 14 },
    { header: "Costo vigente", key: "currentUnitCost", width: 16 },
    { header: "Estado", key: "archived", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      category: row.category ?? "",
      baseUnit: UNIT_LABELS[row.baseUnit],
      yieldPercentage: Number(row.yieldPercentage),
      currentUnitCost: row.hasPurchases ? Number(row.currentUnitCost) : "Sin compras",
      archived: row.archived ? "Archivado" : "Activo",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
