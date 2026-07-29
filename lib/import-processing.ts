import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { normalize } from "@/lib/normalize";

export function parseNumericLoose(raw: string): Decimal | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  try {
    return new Decimal(cleaned);
  } catch {
    return null;
  }
}

/**
 * Parsea una fecha de forma tolerante: ISO (yyyy-mm-dd, incluye lo que produce cellToString
 * para celdas de tipo fecha de Excel), dd/mm/yyyy (formato usual en MX) y numero de serie de
 * Excel (dias desde 1899-12-30), por si la celda llega como texto plano en vez de fecha real.
 */
export function parseDateLoose(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const day = Number(d);
    const month = Number(m);
    const year = Number(y);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  if (/^\d+$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 20000 && serial < 80000) {
      const epochMs = Date.UTC(1899, 11, 30);
      const date = new Date(epochMs + serial * 86400000);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

/**
 * Aplica el mapeo de columnas a las filas crudas de un ImportBatch: crea los ImportRow
 * (MATCHED/PENDING/IGNORED/ERROR) y hace upsert de DailySale para las filas ya reconocidas
 * via DishAlias. Logica de negocio pura (sin auth) para poder reutilizarla desde el server
 * action y desde pruebas/scripts.
 */
export async function processBatchRows(
  organizationId: string,
  batchId: string,
  headers: string[],
  rawRows: string[][],
  mapping: { dateHeader: string; nameHeader: string; qtyHeader: string; priceHeader: string },
): Promise<{ rowsMatched: number; rowsPending: number }> {
  const dateIdx = headers.indexOf(mapping.dateHeader);
  const nameIdx = headers.indexOf(mapping.nameHeader);
  const qtyIdx = headers.indexOf(mapping.qtyHeader);
  const priceIdx = headers.indexOf(mapping.priceHeader);

  if (dateIdx === -1 || nameIdx === -1 || qtyIdx === -1 || priceIdx === -1) {
    throw new Error("Selecciona las cuatro columnas (fecha, platillo, cantidad y precio).");
  }

  let rowsMatched = 0;
  let rowsPending = 0;

  for (const rawRow of rawRows) {
    const rawName = (rawRow[nameIdx] ?? "").trim();
    const date = parseDateLoose(rawRow[dateIdx] ?? "");
    const qty = parseNumericLoose(rawRow[qtyIdx] ?? "");
    const price = parseNumericLoose(rawRow[priceIdx] ?? "");

    if (!rawName || !date || !qty || !price) {
      await prisma.importRow.create({
        data: {
          importBatchId: batchId,
          rawName: rawName || "(vacio)",
          normalizedName: normalize(rawName || ""),
          date,
          quantitySold: (qty ?? new Decimal(0)).toString(),
          unitPrice: (price ?? new Decimal(0)).toString(),
          status: "ERROR",
          errorMessage: !rawName
            ? "Nombre de platillo vacio."
            : !date
              ? "Fecha no reconocida."
              : "Cantidad o precio no numerico.",
        },
      });
      continue;
    }

    const normalizedName = normalize(rawName);
    const alias = await prisma.dishAlias.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
    });

    if (alias?.ignored) {
      await prisma.importRow.create({
        data: {
          importBatchId: batchId,
          rawName,
          normalizedName,
          date,
          quantitySold: qty.toString(),
          unitPrice: price.toString(),
          status: "IGNORED",
        },
      });
      continue;
    }

    if (alias?.recipeId) {
      await upsertSaleForRow(organizationId, alias.recipeId, date, qty.toString(), price.toString(), batchId);
      await prisma.importRow.create({
        data: {
          importBatchId: batchId,
          rawName,
          normalizedName,
          date,
          quantitySold: qty.toString(),
          unitPrice: price.toString(),
          status: "MATCHED",
          matchedRecipeId: alias.recipeId,
        },
      });
      rowsMatched += 1;
      continue;
    }

    await prisma.importRow.create({
      data: {
        importBatchId: batchId,
        rawName,
        normalizedName,
        date,
        quantitySold: qty.toString(),
        unitPrice: price.toString(),
        status: "PENDING",
      },
    });
    rowsPending += 1;
  }

  return { rowsMatched, rowsPending };
}

async function upsertSaleForRow(
  organizationId: string,
  recipeId: string,
  date: Date,
  quantitySold: string,
  unitPrice: string,
  importBatchId: string,
) {
  await prisma.dailySale.upsert({
    where: {
      organizationId_recipeId_date: { organizationId, recipeId, date },
    },
    create: {
      organizationId,
      recipeId,
      date,
      quantitySold,
      unitPrice,
      source: "import",
      importBatchId,
    },
    update: { quantitySold, unitPrice, source: "import", importBatchId },
  });
}

type PendingRow = {
  id: string;
  rawName: string;
  normalizedName: string;
  date: Date | null;
  quantitySold: Decimal;
  unitPrice: Decimal;
  importBatchId: string;
};

/** Vincula un ImportRow pendiente a una receta existente: crea/actualiza el DishAlias y el DailySale. */
export async function linkRowToRecipe(organizationId: string, row: PendingRow, recipeId: string) {
  if (!row.date) throw new Error("La fila no tiene una fecha valida.");

  await prisma.dishAlias.upsert({
    where: { organizationId_normalizedName: { organizationId, normalizedName: row.normalizedName } },
    create: { organizationId, externalName: row.rawName, normalizedName: row.normalizedName, recipeId },
    update: { recipeId, ignored: false },
  });

  await upsertSaleForRow(
    organizationId,
    recipeId,
    row.date,
    row.quantitySold.toString(),
    row.unitPrice.toString(),
    row.importBatchId,
  );

  await prisma.importRow.update({
    where: { id: row.id },
    data: { status: "MATCHED", matchedRecipeId: recipeId },
  });
}

/** Crea una receta nueva (platillo de menu) a partir de un ImportRow pendiente y la vincula. */
export async function createRecipeAndLinkRow(organizationId: string, row: PendingRow) {
  const recipe = await prisma.recipe.create({
    data: {
      organizationId,
      name: row.rawName,
      yieldQty: "1",
      yieldUnit: "PIECE",
      isMenuItem: true,
      sellingPrice: row.unitPrice.toString(),
    },
  });

  await linkRowToRecipe(organizationId, row, recipe.id);

  return recipe;
}

/** Marca un ImportRow pendiente como "nunca es un platillo" (propinas, descuentos, etc.). */
export async function ignoreRowPermanently(organizationId: string, row: PendingRow) {
  await prisma.dishAlias.upsert({
    where: { organizationId_normalizedName: { organizationId, normalizedName: row.normalizedName } },
    create: { organizationId, externalName: row.rawName, normalizedName: row.normalizedName, ignored: true },
    update: { ignored: true, recipeId: null },
  });

  await prisma.importRow.update({ where: { id: row.id }, data: { status: "IGNORED" } });
}
