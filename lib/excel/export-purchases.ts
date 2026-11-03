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
    // El costo unitario va pegado a la unidad porque se leen juntos: $195.00 / KG. El importe
    // y el proveedor quedan al final, que es por donde se revisa contra la factura.
    { header: "Costo unitario", key: "unitCost", width: 14, style: { numFmt: '"$"#,##0.0000' } },
    { header: "Importe total", key: "price", width: 14, style: { numFmt: '"$"#,##0.00' } },
    // El desglose va despues del importe y antes del proveedor: se lee de izquierda a derecha
    // como viene en la factura, subtotal primero y lo que se paga al final. Las tasas salen
    // junto a su monto para poder auditar de donde salio cada cifra.
    { header: "IEPS %", key: "iepsRate", width: 9, style: { numFmt: "0.00%" } },
    { header: "IEPS", key: "ieps", width: 13, style: { numFmt: '"$"#,##0.00' } },
    { header: "IVA %", key: "ivaRate", width: 9, style: { numFmt: "0.00%" } },
    { header: "IVA", key: "iva", width: 13, style: { numFmt: '"$"#,##0.00' } },
    { header: "Total con impuestos", key: "totalConImpuestos", width: 18, style: { numFmt: '"$"#,##0.00' } },
    { header: "Proveedor", key: "supplier", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      invoiceFolio: row.invoiceFolio ?? "",
      folio: row.folioLabel,
      date: row.dateLabel,
      product: row.productName,
      // Numero, no texto: la cantidad venia formateada como cadena y no se podia sumar ni
      // ordenar en la hoja.
      quantity: row.quantityValue,
      unit: row.unitLabel,
      unitCost: row.unitCostValue,
      price: row.totalPrice,
      // Las tasas van como fraccion porque la columna esta formateada en %: 0.16 se imprime 16%.
      iepsRate: row.iepsRate / 100,
      ieps: row.taxes.ieps,
      ivaRate: row.ivaRate / 100,
      iva: row.taxes.iva,
      totalConImpuestos: row.taxes.total,
      supplier: row.supplierName ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
