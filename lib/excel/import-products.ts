import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";

export type ParsedProductRow = {
  /** Fila del Excel tal como la ve el usuario, para poder senalarle donde esta el error. */
  excelRow: number;
  name: string;
  categoryName: string | null;
  baseUnit: UnitValue;
  yieldPercentage: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: string | null;
  targetStock: string;
};

export type RowError = { excelRow: number; message: string };

export type ParseResult = {
  rows: ParsedProductRow[];
  errors: RowError[];
};

/** Acepta tanto la etiqueta visible (PZA, LT) como el nombre interno (PIECE, L). */
const UNIT_BY_INPUT = new Map<string, UnitValue>();
for (const unit of UNITS) {
  UNIT_BY_INPUT.set(unit.toUpperCase(), unit);
  UNIT_BY_INPUT.set(UNIT_LABELS[unit].toUpperCase(), unit);
}

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

function parseNumber(raw: string): Decimal | null {
  if (!raw) return null;
  // Tolera "1,829.50" y "85 %" porque es lo que sale de copiar y pegar de otro archivo.
  const limpio = raw.replace(/[%\s]/g, "").replace(/,/g, "");
  try {
    const n = new Decimal(limpio);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

/**
 * Lee la plantilla de productos y valida fila por fila.
 *
 * No toca la base de datos: solo convierte el archivo en filas limpias o en errores con el
 * numero de fila. Quien llama decide si guarda o no. Las filas completamente vacias se ignoran
 * (son las que quedan al borrar los ejemplos).
 */
export async function parseProductsWorkbook(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { rows: [], errors: [{ excelRow: 0, message: "No se pudo leer el archivo. Debe ser un Excel (.xlsx) guardado desde la plantilla." }] };
  }

  const sheet = workbook.getWorksheet("Productos") ?? workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], errors: [{ excelRow: 0, message: "El archivo no tiene ninguna hoja con datos." }] };
  }

  const rows: ParsedProductRow[] = [];
  const errors: RowError[] = [];
  const nombresVistos = new Map<string, number>();

  sheet.eachRow((row, excelRow) => {
    if (excelRow === 1) return; // encabezados

    const name = cellText(row.getCell(1).value);
    const categoryRaw = cellText(row.getCell(2).value);
    const unitRaw = cellText(row.getCell(3).value);
    const yieldRaw = cellText(row.getCell(4).value);
    const presLabelRaw = cellText(row.getCell(5).value);
    const presQtyRaw = cellText(row.getCell(6).value);
    const targetRaw = cellText(row.getCell(7).value);

    const vacia = !name && !categoryRaw && !unitRaw && !yieldRaw && !presLabelRaw && !presQtyRaw && !targetRaw;
    if (vacia) return;

    const push = (message: string) => errors.push({ excelRow, message });

    if (!name) {
      push("Falta el nombre del producto.");
      return;
    }

    const clave = name.toUpperCase();
    const anterior = nombresVistos.get(clave);
    if (anterior) {
      push(`"${name}" esta repetido en el archivo (ya venia en la fila ${anterior}).`);
      return;
    }
    nombresVistos.set(clave, excelRow);

    const baseUnit = UNIT_BY_INPUT.get(unitRaw.toUpperCase());
    if (!baseUnit) {
      push(
        unitRaw
          ? `Unidad base "${unitRaw}" no valida. Usa una de: ${UNITS.map((u) => UNIT_LABELS[u]).join(", ")}.`
          : "Falta la unidad base.",
      );
      return;
    }

    let yieldPercentage = new Decimal(100);
    if (yieldRaw) {
      const parsed = parseNumber(yieldRaw);
      if (!parsed) {
        push(`Rendimiento "${yieldRaw}" no es un numero.`);
        return;
      }
      // Tolera que capturen 0.85 en vez de 85.
      yieldPercentage = parsed.gt(0) && parsed.lte(1) ? parsed.times(100) : parsed;
      if (yieldPercentage.lte(0) || yieldPercentage.gt(100)) {
        push("El rendimiento debe ser mayor a 0 y hasta 100.");
        return;
      }
    }

    let presentationUnitLabel: string | null = null;
    let presentationUnitQty: string | null = null;
    if (presLabelRaw || presQtyRaw) {
      if (!presLabelRaw) {
        push("Capturaste el contenido de la presentacion pero falta su nombre (ej. Botella).");
        return;
      }
      const qty = parseNumber(presQtyRaw);
      if (!qty || qty.lte(0)) {
        push(`Falta el contenido de la presentacion "${presLabelRaw}", o no es mayor a cero.`);
        return;
      }
      presentationUnitLabel = presLabelRaw;
      presentationUnitQty = qty.toString();
    }

    let targetStock = new Decimal(0);
    if (targetRaw) {
      const parsed = parseNumber(targetRaw);
      if (!parsed || parsed.lt(0)) {
        push(`Stock objetivo "${targetRaw}" no es un numero valido.`);
        return;
      }
      targetStock = parsed;
    }

    rows.push({
      excelRow,
      name,
      categoryName: categoryRaw || null,
      baseUnit,
      yieldPercentage: yieldPercentage.toString(),
      presentationUnitLabel,
      presentationUnitQty,
      targetStock: targetStock.toString(),
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ excelRow: 0, message: "El archivo no tiene ninguna fila con datos." });
  }

  return { rows, errors };
}
