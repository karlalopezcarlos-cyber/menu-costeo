import ExcelJS from "exceljs";

export type RecipeCostTemplateRow = {
  recipeName: string;
  /** Lo que hoy cuesta la receta por sus ingredientes, o null si no se pudo costear. */
  calculatedCost: number | null;
  /** Lo que ya estaba capturado a mano, para que se vea y se pueda corregir. */
  manualCost: number | null;
  sellingPrice: number | null;
  /** "Calculado", "Capturado" o "Sin costo": de donde sale hoy el numero de ese platillo. */
  origin: string;
};

/**
 * Plantilla de costos por platillo: una fila por platillo de menu, con el costo capturado
 * precargado para que se vea lo que ya hay y se corrija encima.
 *
 * Las dos columnas de la derecha son de lectura: estan para que quien llena el archivo sepa
 * cuales platillos ya se costean solos (y entonces no hace falta capturarles nada) y cuales
 * estan en ceros. El importador no las lee.
 */
export async function buildRecipeCostsTemplateWorkbook(
  rows: RecipeCostTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Costos");

  sheet.columns = [
    { header: "Platillo", key: "recipeName", width: 36 },
    { header: "Costo capturado", key: "manualCost", width: 18 },
    { header: "Costo actual", key: "calculatedCost", width: 16 },
    { header: "De donde sale hoy", key: "origin", width: 20 },
    { header: "Precio de venta", key: "sellingPrice", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("manualCost").numFmt = '"$"#,##0.00';
  sheet.getColumn("calculatedCost").numFmt = '"$"#,##0.00';
  sheet.getColumn("sellingPrice").numFmt = '"$"#,##0.00';

  for (const row of rows) {
    sheet.addRow({
      recipeName: row.recipeName,
      manualCost: row.manualCost ?? "",
      calculatedCost: row.calculatedCost ?? "",
      origin: row.origin,
      sellingPrice: row.sellingPrice ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
