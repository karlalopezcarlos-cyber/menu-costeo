import ExcelJS from "exceljs";

export type SalesTemplateRow = {
  recipeName: string;
  sellingPrice: string | null;
};

/**
 * Plantilla para captura/carga de ventas: una fila por cada platillo de menu activo, con
 * Platillo y Precio precargados (el precio de venta configurado en la receta) y Fecha/Cantidad
 * en blanco para que el usuario las llene dia a dia antes de volver a subir el archivo.
 */
export async function buildSalesTemplateWorkbook(rows: SalesTemplateRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ventas");

  sheet.columns = [
    { header: "Fecha", key: "date", width: 14 },
    { header: "Platillo", key: "recipeName", width: 30 },
    { header: "Cantidad", key: "quantity", width: 12 },
    { header: "Precio", key: "price", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("date").numFmt = "dd/mm/yyyy";
  sheet.getColumn("price").numFmt = '"$"#,##0.00';

  for (const row of rows) {
    sheet.addRow({
      date: "",
      recipeName: row.recipeName,
      quantity: "",
      price: row.sellingPrice ? Number(row.sellingPrice) : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
