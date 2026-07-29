import ExcelJS from "exceljs";

export type InventoryCountExportRow = {
  categoryName: string | null;
  type: "Producto" | "Subreceta";
  name: string;
  unitLabel: string;
  quantity: number;
  unitCost: number;
  total: number;
};

export async function buildInventoryCountWorkbook(
  dateLabel: string,
  rows: InventoryCountExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = `Conteo ${dateLabel}`.replace(/[*?:\\/[\]]/g, "-").slice(0, 31);
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = [
    { header: "Categoria", key: "category", width: 18 },
    { header: "Tipo", key: "type", width: 12 },
    { header: "Nombre", key: "name", width: 30 },
    { header: "Cantidad", key: "quantity", width: 14 },
    { header: "Unidad", key: "unit", width: 10 },
    { header: "Costo unitario", key: "unitCost", width: 14, style: { numFmt: '"$"#,##0.0000' } },
    { header: "Total", key: "total", width: 14, style: { numFmt: '"$"#,##0.00' } },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      category: row.categoryName ?? "",
      type: row.type,
      name: row.name,
      quantity: row.quantity,
      unit: row.unitLabel,
      unitCost: Number(row.unitCost.toFixed(4)),
      total: Number(row.total.toFixed(2)),
    });
  }

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const totalRow = sheet.addRow({ name: "Total", total: Number(grandTotal.toFixed(2)) });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
