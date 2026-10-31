import { Prisma } from "@/generated/prisma/client";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";

export type TransformationFilters = {
  search: string;
  folio: string;
  dateFrom: string;
  dateTo: string;
};

export function hasAnyTransformationFilter(filters: TransformationFilters): boolean {
  return Boolean(
    filters.search.trim() || filters.folio.trim() || filters.dateFrom || filters.dateTo,
  );
}

export function formatPortioningFolio(folio: number): string {
  return `POR-${String(folio).padStart(4, "0")}`;
}

export function parsePortioningFolio(value: string): number | null {
  const match = /^(?:POR-)?0*(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function buildTransformationWhere(
  sucursalId: string,
  filters: TransformationFilters,
): Prisma.PortioningEntryWhereInput {
  const where: Prisma.PortioningEntryWhereInput = { sucursalId };

  // Se busca por lo que entro y por lo que salio: la pregunta normal es "que paso con el atun",
  // sin acordarse de si el atun era el producto de origen o el limpio que resulto.
  const search = filters.search.trim();
  if (search) {
    where.OR = [
      { product: { name: { contains: search, mode: "insensitive" } } },
      { outputProduct: { name: { contains: search, mode: "insensitive" } } },
      { outputs: { some: { product: { name: { contains: search, mode: "insensitive" } } } } },
      { outputs: { some: { recipe: { name: { contains: search, mode: "insensitive" } } } } },
    ];
  }

  const folioNumber = filters.folio.trim() ? parsePortioningFolio(filters.folio) : null;
  if (folioNumber !== null) where.folio = folioNumber;

  // Un folio ya identifica una sola transformacion: al buscarlo no se le aplica el rango de
  // fechas, que puede seguir mostrando el mes en curso.
  // date se guarda como medianoche UTC del dia capturado, asi que el rango va en UTC explicito.
  if (folioNumber === null && (filters.dateFrom || filters.dateTo)) {
    where.date = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  return where;
}

/** Lo que necesita una fila, tanto en pantalla como en el Excel. */
export type TransformationOutputRow = {
  id: string;
  name: string;
  qty: number;
  unitLabel: string;
  unitCost: number;
};

export type TransformationRow = {
  id: string;
  folio: number;
  folioLabel: string;
  dateLabel: string;
  dateValue: number;
  productName: string;
  initialQty: number;
  initialUnitLabel: string;
  /** Costo total de lo que entro: cantidad por su costo unitario congelado. */
  initialCost: number;
  comment: string | null;
  outputs: TransformationOutputRow[];
  yieldPct: number;
};

type EntryWithRelations = {
  id: string;
  folio: number;
  date: Date;
  initialQty: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  realYieldPct: Prisma.Decimal;
  outputQty: Prisma.Decimal | null;
  comment: string | null;
  product: { name: string; baseUnit: string };
  outputProduct: { name: string; baseUnit: string } | null;
  outputs: {
    id: string;
    qty: Prisma.Decimal | null;
    portions: number | null;
    realUnitCost: Prisma.Decimal;
    product: { name: string; baseUnit: string } | null;
    recipe: { name: string } | null;
  }[];
};

export function toTransformationRow(entry: EntryWithRelations): TransformationRow {
  const outputs: TransformationOutputRow[] = entry.outputs.map((output) => ({
    id: output.id,
    name: output.product?.name ?? output.recipe?.name ?? "—",
    qty: Number(output.qty ?? output.portions ?? 0),
    unitLabel: output.product ? UNIT_LABELS[output.product.baseUnit as UnitValue] : "",
    unitCost: Number(output.realUnitCost),
  }));

  // Limpiezas viejas: su salida vivia en la entrada, no en renglones aparte, y su costo por
  // unidad nunca se guardo (el flujo de entonces lo calculaba solo para actualizar el catalogo).
  // Se reconstruye con la misma regla de hoy —todo el dinero que entro sale en la unica salida—
  // que para una salida sola se reduce a costo de entrada entre lo que salio. No es una
  // estimacion: es el mismo numero que daria capturarla de nuevo.
  if (outputs.length === 0 && entry.outputProduct) {
    const qty = Number(entry.outputQty ?? 0);
    const totalCost = Number(entry.initialQty) * Number(entry.unitCost);
    outputs.push({
      id: `${entry.id}-legacy`,
      name: entry.outputProduct.name,
      qty,
      unitLabel: UNIT_LABELS[entry.outputProduct.baseUnit as UnitValue],
      unitCost: qty > 0 ? totalCost / qty : 0,
    });
  }

  return {
    id: entry.id,
    folio: entry.folio,
    folioLabel: formatPortioningFolio(entry.folio),
    dateLabel: entry.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: entry.date.getTime(),
    productName: entry.product.name,
    initialQty: Number(entry.initialQty),
    initialUnitLabel: UNIT_LABELS[entry.product.baseUnit as UnitValue],
    initialCost: Number(entry.initialQty) * Number(entry.unitCost),
    comment: entry.comment,
    outputs,
    yieldPct: Number(entry.realYieldPct),
  };
}

/** El include que necesita toTransformationRow, compartido por la pantalla y el Excel. */
export const TRANSFORMATION_INCLUDE = {
  product: { select: { name: true, baseUnit: true } },
  outputProduct: { select: { name: true, baseUnit: true } },
  outputs: {
    include: {
      product: { select: { name: true, baseUnit: true } },
      recipe: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.PortioningEntryInclude;
