import ExcelJS from "exceljs";
import type { PurchaseRow } from "@/app/(app)/purchases/purchase-rows";

export async function buildPurchasesWorkbook(rows: PurchaseRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Compras");

  sheet.columns = [
    { header: "Folio", key: "folio", width: 12 },
    { header: "Fecha", key: "date", width: 14 },
    { header: "Producto", key: "product", width: 28 },
    { header: "Cantidad", key: "quantity", width: 14 },
    { header: "Unidad", key: "unit", width: 10 },
    { header: "Proveedor", key: "supplier", width: 20 },
    { header: "Precio", key: "price", width: 12 },
    { header: "Costo unitario resultante", key: "cost", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      folio: row.folioLabel,
      date: row.dateLabel,
      product: row.productName,
      quantity: row.quantityLabel,
      unit: row.unitLabel,
      supplier: row.supplierName ?? "",
      price: row.totalPrice,
      cost: row.unitCostLabel,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
