import ExcelJS from "exceljs";
import type { PurchaseRow } from "@/app/(app)/purchases/purchase-rows";

export async function buildPurchasesWorkbook(rows: PurchaseRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Compras");

  sheet.columns = [
    // Dos columnas separadas: el numero que viene en el papel del proveedor y el consecutivo
    // interno. Quien filtra el Excel busca por el primero; quien rastrea un registro, por el segundo.
    { header: "Folio factura", key: "invoiceFolio", width: 18 },
    { header: "Folio sistema", key: "folio", width: 14 },
    { header: "Fecha", key: "date", width: 14 },
    { header: "Producto", key: "product", width: 28 },
    { header: "Cantidad", key: "quantity", width: 14 },
    { header: "Unidad", key: "unit", width: 10 },
    { header: "Proveedor", key: "supplier", width: 20 },
    { header: "Precio", key: "price", width: 12, style: { numFmt: '"$"#,##0.00' } },
    { header: "Costo unitario", key: "unitCost", width: 14, style: { numFmt: '"$"#,##0.0000' } },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      invoiceFolio: row.invoiceFolio ?? "",
      folio: row.folioLabel,
      date: row.dateLabel,
      product: row.productName,
      quantity: row.quantityLabel,
      unit: row.unitLabel,
      supplier: row.supplierName ?? "",
      price: row.totalPrice,
      unitCost: row.unitCostValue,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
