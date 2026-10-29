import ExcelJS from "exceljs";

export type CountTemplateRow = {
  categoryName: string | null;
  type: "Producto" | "Subreceta";
  name: string;
  presentationLabel: string;
  unitLabel: string;
};

/**
 * Formato en blanco para salir a contar el almacen con una tabla y una pluma.
 *
 * Trae todo lo inventariable ordenado por categoria y nombre, con la columna de cantidad vacia.
 * Los gastos (renta, luz, servicios) no aparecen: no son existencias que alguien pueda contar.
 */
export async function buildInventoryCountTemplateWorkbook(
  rows: CountTemplateRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Conteo");

  sheet.columns = [
    { key: "category", width: 22 },
    { key: "type", width: 11 },
    { key: "name", width: 38 },
    { key: "presentation", width: 24 },
    { key: "unit", width: 10 },
    { key: "quantity", width: 16 },
  ];

  const titulo = sheet.addRow(["Conteo de inventario"]);
  titulo.font = { bold: true, size: 14 };
  titulo.height = 22;

  const datos = sheet.addRow(["Fecha:", "", "Conto:", "", "", ""]);
  datos.font = { bold: true };
  for (const col of ["B", "D"]) {
    datos.getCell(col).border = { bottom: { style: "thin", color: { argb: "FF9A948A" } } };
  }

  sheet.addRow([]);

  const header = sheet.addRow([
    "Categoria",
    "Tipo",
    "Nombre",
    "Presentacion",
    "Unidad",
    "Cantidad contada",
  ]);
  header.font = { bold: true, color: { argb: "FFF0EDE8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  const headerRowNumber = header.number;

  for (const row of rows) {
    const added = sheet.addRow({
      category: row.categoryName ?? "Sin categoria",
      type: row.type,
      name: row.name,
      presentation: row.presentationLabel,
      unit: row.unitLabel,
      quantity: "",
    });
    added.getCell("presentation").font = { color: { argb: "FF9A948A" } };
    // La celda de cantidad va enmarcada para que se vea donde hay que escribir.
    added.getCell("quantity").border = {
      top: { style: "thin", color: { argb: "FFD6D1C8" } },
      left: { style: "thin", color: { argb: "FFD6D1C8" } },
      bottom: { style: "thin", color: { argb: "FFD6D1C8" } },
      right: { style: "thin", color: { argb: "FFD6D1C8" } },
    };
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber + rows.length, column: 6 },
  };

  // Para imprimirlo: cabe a lo ancho y el encabezado se repite en cada hoja.
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
