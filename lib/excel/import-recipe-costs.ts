import ExcelJS from "exceljs";
import Decimal from "decimal.js";

export type ParsedRecipeCostRow = {
  /** Fila del Excel tal como la ve el usuario, para poder senalarle donde esta el error. */
  excelRow: number;
  recipeName: string;
  cost: Decimal;
};

export type RowError = { excelRow: number; message: string };

export type ParseResult = {
  rows: ParsedRecipeCostRow[];
  errors: RowError[];
  /** Los encabezados que se reconocieron, para poder decirle al usuario que fue lo que se leyo. */
  columns: { recipe: string; cost: string } | null;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
    return "";
  }
  return String(value).trim();
}

function parseMoney(raw: string): Decimal | null {
  if (!raw) return null;
  // Tolera "$1,829.50" y "1 829.50" porque es lo que sale de copiar y pegar de otro archivo.
  const limpio = raw.replace(/[$\s]/g, "").replace(/,/g, "");
  if (limpio === "") return null;
  try {
    const n = new Decimal(limpio);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const NOMBRES_DE_PLATILLO = ["platillo", "receta", "producto", "descripcion", "nombre"];

/**
 * Encuentra la fila de encabezados y en que columna quedo cada dato.
 *
 * No se asume que el archivo sea la plantilla. El punto de esta carga es tragarse el Excel que
 * el restaurante ya tiene, que casi nunca empieza en A1 ni usa las mismas palabras: por eso se
 * busca el encabezado en las primeras filas y se reconocen varios nombres para lo mismo.
 */
function ubicarColumnas(sheet: ExcelJS.Worksheet): {
  headerRow: number;
  recipeCol: number;
  costCol: number;
  columns: { recipe: string; cost: string };
} | null {
  const ultimaFilaABuscar = Math.min(sheet.rowCount, 15);

  for (let r = 1; r <= ultimaFilaABuscar; r++) {
    const fila = sheet.getRow(r);
    let recipeCol = 0;
    let recipeHeader = "";
    const candidatosCosto: { col: number; header: string; exacto: boolean }[] = [];

    fila.eachCell({ includeEmpty: false }, (cell, col) => {
      const texto = cellText(cell.value);
      const clave = normaliza(texto);
      if (!clave) return;
      if (!recipeCol && NOMBRES_DE_PLATILLO.some((n) => clave.includes(n))) {
        // "Costo del platillo" no es la columna del nombre: si tambien dice costo, no cuenta.
        if (!clave.includes("costo") && !clave.includes("precio")) {
          recipeCol = col;
          recipeHeader = texto;
        }
      }
      if (clave.includes("costo")) {
        candidatosCosto.push({ col, header: texto, exacto: clave === "costo capturado" });
      }
    });

    if (!recipeCol || candidatosCosto.length === 0) continue;

    // "Costo capturado" gana siempre: es la columna de la plantilla, y existe junto a la
    // informativa "Costo actual". Sin ella, solo se acepta que haya una sola columna de costo;
    // adivinar entre varias seria escribir dinero equivocado en silencio.
    const exacta = candidatosCosto.find((c) => c.exacto);
    const elegida = exacta ?? (candidatosCosto.length === 1 ? candidatosCosto[0] : null);
    if (!elegida) continue;

    return {
      headerRow: r,
      recipeCol,
      costCol: elegida.col,
      columns: { recipe: recipeHeader, cost: elegida.header },
    };
  }

  return null;
}

/**
 * Lee un Excel de costos por platillo y lo convierte en filas limpias o en errores con numero
 * de fila. No toca la base de datos.
 *
 * Una celda de costo vacia NO borra lo que ya estaba capturado: se ignora la fila. Quien baja la
 * plantilla completa y llena nada mas veinte platillos espera cambiar veinte, no vaciar los
 * demas. Para quitar un costo capturado se edita esa receta.
 *
 * Si el mismo platillo aparece varias veces con el mismo costo -lo que pasa cuando el archivo es
 * un escandallo con una fila por ingrediente- se toma ese costo una sola vez. Si aparece con
 * costos distintos, es un error: el archivo no dice cual es, y esta funcion tampoco lo inventa.
 */
export async function parseRecipeCostsWorkbook(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      rows: [],
      errors: [{ excelRow: 0, message: "No se pudo leer el archivo. Debe ser un Excel (.xlsx)." }],
      columns: null,
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ excelRow: 0, message: "El archivo no tiene ninguna hoja." }],
      columns: null,
    };
  }

  const ubicacion = ubicarColumnas(sheet);
  if (!ubicacion) {
    return {
      rows: [],
      errors: [
        {
          excelRow: 0,
          message:
            "No se encontraron los encabezados. El archivo necesita una columna con el nombre del platillo (Platillo, Receta o Producto) y una sola columna de Costo.",
        },
      ],
      columns: null,
    };
  }

  const errors: RowError[] = [];
  const porNombre = new Map<string, ParsedRecipeCostRow>();

  for (let r = ubicacion.headerRow + 1; r <= sheet.rowCount; r++) {
    const fila = sheet.getRow(r);
    const nombre = cellText(fila.getCell(ubicacion.recipeCol).value);
    const costoTexto = cellText(fila.getCell(ubicacion.costCol).value);

    if (!nombre && !costoTexto) continue;
    if (!nombre) {
      errors.push({ excelRow: r, message: "Hay un costo sin nombre de platillo." });
      continue;
    }
    // Celda de costo vacia: esta fila no se toca. Ver el comentario de arriba.
    if (!costoTexto) continue;

    const costo = parseMoney(costoTexto);
    if (costo === null) {
      errors.push({ excelRow: r, message: `"${costoTexto}" no es un costo valido.` });
      continue;
    }
    if (costo.lt(0)) {
      errors.push({ excelRow: r, message: `El costo de "${nombre}" es negativo.` });
      continue;
    }

    const clave = normaliza(nombre);
    const previo = porNombre.get(clave);
    if (previo) {
      if (!previo.cost.equals(costo)) {
        errors.push({
          excelRow: r,
          message: `"${nombre}" aparece con dos costos distintos: ${previo.cost.toFixed(2)} en la fila ${previo.excelRow} y ${costo.toFixed(2)} aqui.`,
        });
      }
      continue;
    }
    porNombre.set(clave, { excelRow: r, recipeName: nombre, cost: costo });
  }

  return { rows: [...porNombre.values()], errors, columns: ubicacion.columns };
}
