import ExcelJS from "exceljs";

/**
 * Plantilla para dar de alta PLU (platillos de menu) en bloque.
 *
 * Tres columnas y ya: nombre, precio y categoria. No hay columna de rendimiento a proposito,
 * porque un platillo que se vende rinde una pieza y siempre es la misma: el sistema lo pone en
 * 1 PZA solo. Ponerla seria invitar a capturar un numero que despues descuadra el costo por
 * unidad sin que nadie sepa por que.
 *
 * Trae tres hojas: la de captura (con dos ejemplos que se borran), una de instrucciones y una
 * de listas que alimenta el desplegable de Categoria. La lista sale de las categorias de receta
 * que ya existen, pero el importador acepta una nueva y la crea, para no obligar a configurarla
 * antes de la carga.
 */
export async function buildPluTemplateWorkbook(categories: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // --- Hoja de captura ---
  const sheet = workbook.addWorksheet("PLU");
  sheet.columns = [
    { header: "Nombre *", key: "name", width: 40 },
    { header: "Precio de venta *", key: "price", width: 18 },
    { header: "Categoria *", key: "category", width: 26 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFF0EDE8" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn("price").numFmt = '"$"#,##0.00';

  // Dos ejemplos, en gris y en cursiva para que se note que hay que borrarlos.
  const ejemplos = [
    { name: "AGUACHILE 3 SALSAS ORDEN 200 GR", price: 241.38, category: "AGUACHILES" },
    { name: "AVOCADO ROLL", price: 146.55, category: "ROLLOS CLASICOS" },
  ];
  for (const ejemplo of ejemplos) {
    const row = sheet.addRow(ejemplo);
    row.font = { italic: true, color: { argb: "FF9A948A" } };
  }

  // Desplegable de categoria en las primeras 1000 filas de captura. Sin bloquear la escritura
  // libre: el importador da de alta la categoria que no exista.
  if (categories.length > 0) {
    for (let i = 2; i <= 1000; i++) {
      sheet.getCell(`C${i}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: [`Listas!$A$2:$A$${categories.length + 1}`],
        showErrorMessage: false,
      };
    }
  }

  // --- Hoja de instrucciones ---
  const guia = workbook.addWorksheet("Instrucciones");
  guia.columns = [
    { header: "Columna", key: "col", width: 22 },
    { header: "Obligatorio", key: "req", width: 13 },
    { header: "Que va aqui", key: "desc", width: 95 },
  ];
  const guiaHeader = guia.getRow(1);
  guiaHeader.font = { bold: true, color: { argb: "FFF0EDE8" } };
  guiaHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1B19" } };

  const filas: [string, string, string][] = [
    [
      "Nombre",
      "Si",
      "Como aparece el platillo en la comanda. Es con lo que se cruzan las ventas, asi que escribelo igual que en el punto de venta. No se puede repetir en la misma sucursal: si ya existe, la fila se reporta y no se duplica.",
    ],
    [
      "Precio de venta",
      "Si",
      "Lo que cobras al cliente, con IVA incluido o sin el, como lo manejes en el resto del sistema. Solo el numero: 241.38. Se acepta $241.38 y 1,241.38.",
    ],
    [
      "Categoria",
      "Si",
      "Para agrupar el menu: AGUACHILES, ROLLOS CLASICOS, BEBIDAS SIN ALCOHOL. Elige una de la lista o escribe una nueva y el sistema la crea sola.",
    ],
    ["", "", ""],
    [
      "Rendimiento",
      "",
      "No se captura. Todos los PLU se dan de alta con rendimiento 1 PZA, porque un platillo que se vende es una pieza. Asi el costo del platillo y el costo por unidad son el mismo numero.",
    ],
    [
      "Costo",
      "",
      "Tampoco se captura aqui. Los PLU nacen sin receta y sin costo. Despues les capturas los ingredientes en Recetas, o les pones el costo de golpe desde Recetas > Cargar costos.",
    ],
    [
      "Sucursal",
      "",
      "Se dan de alta SOLO en la sucursal en la que estes parada al subir el archivo. No se copian a las demas. Si los quieres en otra, entra a esa sucursal y sube el mismo archivo.",
    ],
  ];
  for (const [col, req, desc] of filas) {
    const row = guia.addRow({ col, req, desc });
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell("col").font = { bold: true };
  }

  guia.addRow({});
  const nota = guia.addRow({
    col: "Antes de subir",
    req: "",
    desc: "Borra las dos filas de ejemplo (van en gris cursiva). Si una fila tiene un error, el sistema no carga nada: te dice que fila y que corregir, lo arreglas y vuelves a subir el mismo archivo.",
  });
  nota.font = { bold: true };
  nota.alignment = { vertical: "top", wrapText: true };

  // --- Hoja de listas (alimenta el desplegable) ---
  const listas = workbook.addWorksheet("Listas");
  listas.columns = [{ header: "Categorias existentes", key: "cat", width: 30 }];
  listas.getRow(1).font = { bold: true };
  for (const name of categories) listas.addRow({ cat: name });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
