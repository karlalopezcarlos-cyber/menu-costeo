import ExcelJS from "exceljs";
import Decimal from "decimal.js";

/**
 * Lector de archivos "una cosa y lo que cuesta".
 *
 * Sirve para los costos por platillo y para los costos por producto, que son el mismo problema:
 * un Excel que el restaurante ya tiene, con el nombre de algo en una columna y su costo en otra,
 * y que casi nunca empieza en A1 ni usa las palabras de nuestra plantilla.
 */

export type ParsedNameCostRow = {
  /** Fila del Excel tal como la ve el usuario, para poder senalarle donde esta el error. */
  excelRow: number;
  name: string;
  cost: Decimal;
};

export type RowError = { excelRow: number; message: string };

export type NameCostParseResult = {
  rows: ParsedNameCostRow[];
  errors: RowError[];
  /** Los encabezados que se reconocieron, para poder decirle al usuario que fue lo que se leyo. */
  columns: { name: string; cost: string } | null;
  /** Cuando hay varias columnas de costo y ninguna conocida: cuales son, para que elija. */
  costCandidates?: string[];
};

export type NameCostOptions = {
  /** Palabras que pueden encabezar la columna del nombre (ya en minusculas y sin acentos). */
  nameHeaders: string[];
  /**
   * Palabras que delatan la columna del valor. "costo" para un archivo de costos, "cantidad" o
   * "fisico" para un conteo. Ya en minusculas y sin acentos.
   */
  valueKeywords: string[];
  /**
   * Encabezados de valor que ganan sobre cualquier otro cuando hay varias columnas candidatas,
   * en orden de preferencia. Ya en minusculas y sin acentos.
   */
  preferredValueHeaders?: string[];
  /** Como llamarle a la cosa en los mensajes de error ("producto", "platillo"). */
  noun: string;
  /** Como llamarle al numero en los mensajes ("costo", "cantidad"). */
  valueNoun: string;
  /**
   * El encabezado exacto que el usuario eligio, cuando el archivo trae varias columnas
   * candidatas y ninguna es de las conocidas. Gana sobre todo lo demas.
   */
  valueHeader?: string;
  /** Si se aceptan numeros negativos. Un costo no; una diferencia de inventario si. */
  allowNegative?: boolean;
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

export function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Encuentra la fila de encabezados y en que columna quedo cada dato.
 *
 * Se busca el encabezado en las primeras filas y se reconocen varios nombres para lo mismo,
 * porque el punto es tragarse el archivo que el restaurante ya tiene.
 */
type Ubicacion = {
  headerRow: number;
  nameCol: number;
  costCol: number;
  columns: { name: string; cost: string };
};

/** Lo que se encontro cuando no se pudo decidir, para poder decirselo al usuario. */
type Ambiguedad = { candidatos: string[] };

function ubicarColumnas(
  sheet: ExcelJS.Worksheet,
  opts: NameCostOptions,
): Ubicacion | Ambiguedad | null {
  const ultimaFilaABuscar = Math.min(sheet.rowCount, 15);
  const preferidos = (opts.preferredValueHeaders ?? []).map(normaliza);
  const elegidoPorUsuario = opts.valueHeader ? normaliza(opts.valueHeader) : null;
  let ambiguedad: Ambiguedad | null = null;

  for (let r = 1; r <= ultimaFilaABuscar; r++) {
    const fila = sheet.getRow(r);
    let nameCol = 0;
    let nameHeader = "";
    const candidatosCosto: { col: number; header: string; clave: string }[] = [];

    fila.eachCell({ includeEmpty: false }, (cell, col) => {
      const texto = cellText(cell.value);
      const clave = normaliza(texto);
      if (!clave) return;
      if (!nameCol && opts.nameHeaders.some((n) => clave.includes(n))) {
        // "Costo del producto" no es la columna del nombre: si tambien trae la palabra del
        // valor, no cuenta.
        if (!opts.valueKeywords.some((k) => clave.includes(k)) && !clave.includes("precio")) {
          nameCol = col;
          nameHeader = texto;
        }
      }
      if (opts.valueKeywords.some((k) => clave.includes(k)) || clave === elegidoPorUsuario) {
        candidatosCosto.push({ col, header: texto, clave });
      }
    });

    if (!nameCol || candidatosCosto.length === 0) continue;

    // Quien eligio la columna manda. Despues, los encabezados conocidos en su orden: el de
    // nuestra plantilla, luego los que usan los sistemas de punto de venta. Sin ninguno de
    // esos, solo se acepta que haya una sola columna candidata; adivinar entre varias seria
    // escribir el numero equivocado en silencio.
    const elegida =
      (elegidoPorUsuario ? candidatosCosto.find((c) => c.clave === elegidoPorUsuario) : undefined) ??
      preferidos.reduce<(typeof candidatosCosto)[number] | undefined>(
        (hallado, pref) => hallado ?? candidatosCosto.find((c) => c.clave === pref),
        undefined,
      ) ??
      (candidatosCosto.length === 1 ? candidatosCosto[0] : undefined);

    if (!elegida) {
      ambiguedad = { candidatos: candidatosCosto.map((c) => c.header) };
      continue;
    }

    return {
      headerRow: r,
      nameCol,
      costCol: elegida.col,
      columns: { name: nameHeader, cost: elegida.header },
    };
  }

  return ambiguedad;
}

/**
 * Lee el archivo y lo convierte en filas limpias o en errores con numero de fila. No toca la
 * base de datos.
 *
 * Una celda de costo vacia NO borra lo que ya estaba: se ignora la fila. Quien baja la plantilla
 * completa y llena nada mas veinte renglones espera cambiar veinte, no vaciar los demas.
 *
 * Si el mismo nombre aparece varias veces con el mismo costo -lo que pasa cuando el archivo es
 * un desglose con una fila por ingrediente- se toma una sola vez. Si aparece con costos
 * distintos, es un error: el archivo no dice cual es, y esta funcion tampoco lo inventa.
 */
export async function parseNameCostWorkbook(
  buffer: Buffer,
  opts: NameCostOptions,
): Promise<NameCostParseResult> {
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
    return { rows: [], errors: [{ excelRow: 0, message: "El archivo no tiene ninguna hoja." }], columns: null };
  }

  const ubicacion = ubicarColumnas(sheet, opts);
  if (!ubicacion) {
    return {
      rows: [],
      errors: [
        {
          excelRow: 0,
          message: `No se encontraron los encabezados. El archivo necesita una columna con el nombre del ${opts.noun} y una sola columna de ${opts.valueNoun}.`,
        },
      ],
      columns: null,
    };
  }
  if (!("headerRow" in ubicacion)) {
    // Hay varias columnas candidatas y ninguna conocida. Se le dicen cuales son, en vez de
    // escoger una por el usuario: la diferencia entre dos columnas asi es dinero.
    return {
      rows: [],
      errors: [
        {
          excelRow: 0,
          message: `El archivo trae mas de una columna de ${opts.valueNoun} y no se cual usar: ${ubicacion.candidatos.join(", ")}. Escribe cual quieres en el campo de abajo y vuelve a subirlo.`,
        },
      ],
      columns: null,
      costCandidates: ubicacion.candidatos,
    };
  }

  const errors: RowError[] = [];
  const porNombre = new Map<string, ParsedNameCostRow>();

  for (let r = ubicacion.headerRow + 1; r <= sheet.rowCount; r++) {
    const fila = sheet.getRow(r);
    const nombre = cellText(fila.getCell(ubicacion.nameCol).value);
    const costoTexto = cellText(fila.getCell(ubicacion.costCol).value);

    if (!nombre && !costoTexto) continue;
    if (!nombre) {
      errors.push({ excelRow: r, message: `Hay un ${opts.valueNoun} sin nombre de ${opts.noun}.` });
      continue;
    }
    // Celda de costo vacia: esta fila no se toca. Ver el comentario de arriba.
    if (!costoTexto) continue;

    const costo = parseMoney(costoTexto);
    if (costo === null) {
      errors.push({ excelRow: r, message: `"${costoTexto}" no es un ${opts.valueNoun} valido.` });
      continue;
    }
    if (costo.lt(0) && !opts.allowNegative) {
      errors.push({ excelRow: r, message: `El ${opts.valueNoun} de "${nombre}" es negativo.` });
      continue;
    }

    const clave = normaliza(nombre);
    const previo = porNombre.get(clave);
    if (previo) {
      if (!previo.cost.equals(costo)) {
        errors.push({
          excelRow: r,
          message: `"${nombre}" aparece dos veces con ${opts.valueNoun} distinto: ${previo.cost.toFixed(2)} en la fila ${previo.excelRow} y ${costo.toFixed(2)} aqui.`,
        });
      }
      continue;
    }
    porNombre.set(clave, { excelRow: r, name: nombre, cost: costo });
  }

  return { rows: [...porNombre.values()], errors, columns: ubicacion.columns };
}
