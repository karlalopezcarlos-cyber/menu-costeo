import ExcelJS from "exceljs";
import Decimal from "decimal.js";

export type ParsedPluRow = {
  /** Fila del Excel tal como la ve el usuario, para poder senalarle donde esta el error. */
  excelRow: number;
  name: string;
  /** Precio de venta como texto decimal, listo para Prisma. */
  price: string;
  categoryName: string;
};

export type RowError = { excelRow: number; message: string };

export type ParseResult = {
  rows: ParsedPluRow[];
  errors: RowError[];
  /** Que encabezado se leyo como que, para poder decirselo a quien subio el archivo. */
  columns: { name: string; price: string; category: string } | null;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    return "";
  }
  return String(value).trim();
}

/** Sin acentos, sin asteriscos y en minusculas: "Categoria *" y "CATEGORÍA" son lo mismo. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*]/g, "")
    .trim()
    .toLowerCase();
}

function parsePrecio(raw: string): Decimal | null {
  if (!raw) return null;
  // Tolera "$1,241.38" porque es lo que sale de copiar y pegar del punto de venta.
  const limpio = raw.replace(/[$\s]/g, "").replace(/,/g, "");
  try {
    const n = new Decimal(limpio);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

const NOMBRE_HEADERS = ["nombre", "platillo", "plu", "descripcion", "producto", "articulo"];
const PRECIO_HEADERS = ["precio", "venta", "importe"];
const CATEGORIA_HEADERS = ["categoria", "grupo", "familia"];

function buscaEncabezados(sheet: ExcelJS.Worksheet) {
  // El encabezado casi siempre es la fila 1, pero un archivo exportado del punto de venta
  // suele traer un titulo arriba. Se buscan las primeras diez filas antes de rendirse.
  const ultima = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= ultima; r++) {
    const row = sheet.getRow(r);
    let name = 0;
    let price = 0;
    let category = 0;
    const etiquetas: Record<string, string> = {};

    row.eachCell((cell, col) => {
      const texto = normalizar(cellText(cell.value));
      if (!texto) return;
      if (!name && NOMBRE_HEADERS.some((h) => texto.includes(h))) {
        name = col;
        etiquetas.name = cellText(cell.value);
        return;
      }
      if (!price && PRECIO_HEADERS.some((h) => texto.includes(h))) {
        price = col;
        etiquetas.price = cellText(cell.value);
        return;
      }
      if (!category && CATEGORIA_HEADERS.some((h) => texto.includes(h))) {
        category = col;
        etiquetas.category = cellText(cell.value);
      }
    });

    if (name && price && category) {
      return {
        headerRow: r,
        cols: { name, price, category },
        labels: { name: etiquetas.name, price: etiquetas.price, category: etiquetas.category },
      };
    }
  }
  return null;
}

/**
 * Lee la plantilla de PLU y valida fila por fila.
 *
 * No toca la base de datos: solo convierte el archivo en filas limpias o en errores con el
 * numero de fila. Quien llama decide si guarda o no.
 *
 * Las tres columnas son obligatorias. Un PLU sin precio no sirve para nada -no se puede sacar
 * su costo porcentual ni entra a la ingenieria de menu- y uno sin categoria se pierde en una
 * lista de cientos; es mejor detener la carga y senalar la fila que dar de alta un platillo a
 * medias que despues nadie encuentra.
 */
export async function parsePluWorkbook(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      rows: [],
      errors: [
        {
          excelRow: 0,
          message: "No se pudo leer el archivo. Debe ser un Excel (.xlsx) guardado desde la plantilla.",
        },
      ],
      columns: null,
    };
  }

  const sheet = workbook.getWorksheet("PLU") ?? workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ excelRow: 0, message: "El archivo no tiene ninguna hoja con datos." }],
      columns: null,
    };
  }

  const encabezados = buscaEncabezados(sheet);
  if (!encabezados) {
    return {
      rows: [],
      errors: [
        {
          excelRow: 0,
          message:
            "No encontre las columnas. El archivo necesita un renglon de encabezados con el nombre del platillo, el precio y la categoria. Lo mas facil es bajar la plantilla y vaciar ahi tus datos.",
        },
      ],
      columns: null,
    };
  }

  const { headerRow, cols, labels } = encabezados;
  const rows: ParsedPluRow[] = [];
  const errors: RowError[] = [];
  const nombresVistos = new Map<string, number>();

  sheet.eachRow((row, excelRow) => {
    if (excelRow <= headerRow) return;

    const name = cellText(row.getCell(cols.name).value);
    const precioRaw = cellText(row.getCell(cols.price).value);
    const categoryRaw = cellText(row.getCell(cols.category).value);

    if (!name && !precioRaw && !categoryRaw) return; // fila vacia

    const push = (message: string) => errors.push({ excelRow, message });

    if (!name) {
      push("Falta el nombre del platillo.");
      return;
    }

    const clave = name.toUpperCase();
    const anterior = nombresVistos.get(clave);
    if (anterior) {
      push(`"${name}" esta repetido en el archivo (ya venia en la fila ${anterior}).`);
      return;
    }
    nombresVistos.set(clave, excelRow);

    if (!precioRaw) {
      push(`Falta el precio de venta de "${name}".`);
      return;
    }
    const precio = parsePrecio(precioRaw);
    if (!precio) {
      push(`El precio "${precioRaw}" de "${name}" no es un numero.`);
      return;
    }
    if (precio.lt(0)) {
      push(`El precio de "${name}" no puede ser negativo.`);
      return;
    }

    if (!categoryRaw) {
      push(`Falta la categoria de "${name}".`);
      return;
    }

    rows.push({
      excelRow,
      name,
      price: precio.toDecimalPlaces(2).toString(),
      categoryName: categoryRaw,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ excelRow: 0, message: "El archivo no tiene ninguna fila con datos." });
  }

  return { rows, errors, columns: labels };
}
