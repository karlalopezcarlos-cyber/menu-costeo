import ExcelJS from "exceljs";
import { UNITS, UNIT_LABELS } from "@/lib/units";

/**
 * Plantilla para dar de alta productos en bloque.
 *
 * Trae tres hojas: la de captura (con dos ejemplos que se borran), una de instrucciones y una
 * de listas que alimenta los menus desplegables de Unidad base y Categoria. Las listas se
 * generan con las categorias que ya existen en la organizacion, pero el importador acepta
 * categorias nuevas y las crea, para no obligar a configurarlas antes de la carga.
 */
export async function buildProductsTemplateWorkbook(categories: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // --- Hoja de captura ---
  const sheet = workbook.addWorksheet("Productos");
  sheet.columns = [
    { header: "Nombre *", key: "name", width: 34 },
    { header: "Categoria", key: "category", width: 20 },
    { header: "Unidad base *", key: "unit", width: 15 },
    { header: "Rendimiento %", key: "yield", width: 15 },
    { header: "Presentacion: nombre", key: "presLabel", width: 22 },
    { header: "Presentacion: contenido", key: "presQty", width: 22 },
    { header: "Stock objetivo", key: "target", width: 15 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFF0EDE8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Dos ejemplos, en gris y en cursiva para que se note que hay que borrarlos.
  const ejemplos = [
    { name: "ACEITE DE OLIVA", category: "ABARROTES", unit: "LT", yield: 100, presLabel: "Botella", presQty: 0.75, target: 12 },
    { name: "MADERA 2X1", category: "MADERA", unit: "M", yield: 85, presLabel: "Pie tabla", presQty: 1.829, target: 0 },
  ];
  for (const ejemplo of ejemplos) {
    const row = sheet.addRow(ejemplo);
    row.font = { italic: true, color: { argb: "FF9A948A" } };
  }

  // Menus desplegables en las primeras 500 filas de captura.
  const unitList = UNITS.map((u) => UNIT_LABELS[u]).join(",");
  for (let i = 2; i <= 500; i++) {
    sheet.getCell(`C${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${unitList}"`],
      showErrorMessage: true,
      errorTitle: "Unidad no valida",
      error: `Usa una de estas: ${unitList}`,
    };
    if (categories.length > 0) {
      sheet.getCell(`B${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Listas!$A$2:$A$${categories.length + 1}`],
        showErrorMessage: false, // se permite escribir una categoria nueva
      };
    }
  }

  // --- Hoja de instrucciones ---
  const guia = workbook.addWorksheet("Instrucciones");
  guia.columns = [
    { header: "Columna", key: "col", width: 24 },
    { header: "Obligatorio", key: "req", width: 13 },
    { header: "Que va aqui", key: "desc", width: 95 },
  ];
  const guiaHeader = guia.getRow(1);
  guiaHeader.font = { bold: true, color: { argb: "FFF0EDE8" } };
  guiaHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };

  const filas: [string, string, string][] = [
    ["Nombre", "Si", "Como lo vas a buscar en el sistema. No se puede repetir: si ya existe un producto con ese nombre, la fila se reporta y no se duplica."],
    ["Categoria", "No", "Para agrupar y filtrar. Si escribes una categoria que no existe, el sistema la crea sola. Si lo dejas vacio, el producto queda sin categoria."],
    ["Unidad base", "Si", `En la que mides las recetas y el inventario. Opciones: ${UNITS.map((u) => UNIT_LABELS[u]).join(", ")}.`],
    ["Rendimiento %", "No", "Cuanto aprovechas de lo que compras. 100 = sin merma. Si limpias cilantro y pierdes 20%, pon 80. Si de un tablon aprovechas 85%, pon 85. Vacio = 100."],
    ["Presentacion: nombre", "No", "Solo si lo compras por pieza con contenido fijo: Botella, Caja, Pie tabla, Saco. Dejalo vacio si compras directo en la unidad base."],
    ["Presentacion: contenido", "No", "Cuanto trae esa presentacion, EN LA UNIDAD BASE. Una botella de 750 ml con unidad base LT = 0.75. Un pie tabla de madera 2x1 con unidad base M = 1.829."],
    ["Stock objetivo", "No", "Cuanto quieres tener siempre en existencia, en la unidad base. Se usa para sugerir pedidos. Vacio o 0 = sin objetivo."],
    ["", "", "Nota: los productos que se obtienen por proceso (ej. CAMARON LIMPIO) no se cargan aqui. Se crean en Productos marcando \"se obtiene por proceso\", porque su costo lo fija cada limpieza y no una compra."],
  ];
  for (const [col, req, desc] of filas) {
    const row = guia.addRow({ col, req, desc });
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell("col").font = { bold: true };
  }

  guia.addRow({});
  const nota = guia.addRow({ col: "Antes de subir", req: "", desc: "Borra las dos filas de ejemplo (van en gris cursiva). Si una fila tiene un error, el sistema no carga nada: te dice que fila y que corregir, lo arreglas y vuelves a subir el mismo archivo." });
  nota.font = { bold: true };
  nota.alignment = { vertical: "top", wrapText: true };

  // --- Hoja de listas (alimenta los desplegables) ---
  const listas = workbook.addWorksheet("Listas");
  listas.columns = [
    { header: "Categorias existentes", key: "cat", width: 28 },
    { header: "Unidades validas", key: "unit", width: 18 },
  ];
  listas.getRow(1).font = { bold: true };
  const maxFilas = Math.max(categories.length, UNITS.length);
  for (let i = 0; i < maxFilas; i++) {
    listas.addRow({
      cat: categories[i] ?? "",
      unit: UNITS[i] ? UNIT_LABELS[UNITS[i]] : "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
