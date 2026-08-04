import Decimal from "decimal.js";

export type UnitType = "MASS" | "VOLUME" | "COUNT";

export const UNITS = ["G", "KG", "ML", "L", "OZ", "PIECE"] as const;
export type UnitValue = (typeof UNITS)[number];

/** Nomenclatura corta y consistente en toda la app (tablas, formularios, Excel, PDF). */
export const UNIT_LABELS: Record<UnitValue, string> = {
  G: "G",
  KG: "KG",
  ML: "ML",
  L: "LT",
  OZ: "OZ",
  PIECE: "PZA",
};

/** 1 onza liquida (fl oz) = 29.5735 ml. Conversion fisica estandar, universal para cualquier
 * producto liquido (no confundir con la presentacion de compra de un producto, ej. "botella"). */
export const ML_PER_OZ = 29.5735;

export const UNIT_META: Record<UnitValue, { type: UnitType; toCanonical: number }> = {
  G: { type: "MASS", toCanonical: 1 },
  KG: { type: "MASS", toCanonical: 1000 },
  ML: { type: "VOLUME", toCanonical: 1 },
  L: { type: "VOLUME", toCanonical: 1000 },
  OZ: { type: "VOLUME", toCanonical: ML_PER_OZ },
  PIECE: { type: "COUNT", toCanonical: 1 },
};

export class IncompatibleUnitsError extends Error {
  constructor(a: UnitValue, b: UnitValue) {
    super(
      `Unidades incompatibles: "${UNIT_LABELS[a]}" y "${UNIT_LABELS[b]}" no se pueden convertir entre si.`,
    );
    this.name = "IncompatibleUnitsError";
  }
}

export function assertCompatible(a: UnitValue, b: UnitValue) {
  if (UNIT_META[a].type !== UNIT_META[b].type) {
    throw new IncompatibleUnitsError(a, b);
  }
}

/** Convierte una cantidad de una unidad a otra del mismo tipo (masa, volumen o pieza). */
export function convertQty(qty: Decimal.Value, from: UnitValue, to: UnitValue): Decimal {
  assertCompatible(from, to);
  const qtyDecimal = new Decimal(qty);
  const canonicalQty = qtyDecimal.times(UNIT_META[from].toCanonical);
  return canonicalQty.dividedBy(UNIT_META[to].toCanonical);
}

/**
 * Costo unitario en la unidad base del producto, a partir de una compra por presentacion.
 * Ejemplo: presentationQty=900, presentationUnit=ML, price=30, baseUnit=L -> 33.33 (por litro).
 */
export function computeUnitCost(
  price: Decimal.Value,
  presentationQty: Decimal.Value,
  presentationUnit: UnitValue,
  baseUnit: UnitValue,
): Decimal {
  assertCompatible(presentationUnit, baseUnit);
  const priceDecimal = new Decimal(price);
  const canonicalPresentationQty = new Decimal(presentationQty).times(
    UNIT_META[presentationUnit].toCanonical,
  );
  if (canonicalPresentationQty.isZero()) {
    throw new Error("La cantidad de la presentacion no puede ser cero.");
  }
  const canonicalBaseQty = new Decimal(UNIT_META[baseUnit].toCanonical);
  return priceDecimal.times(canonicalBaseQty).dividedBy(canonicalPresentationQty);
}

/**
 * Ajusta un costo unitario por el % de rendimiento neto del producto (merma).
 * Ejemplo: costo bruto $30/kg con 80% de rendimiento (20% de merma, ej. cilantro
 * despues de limpiarlo) -> $37.50/kg de producto neto aprovechable.
 */
export function applyYieldFactor(unitCost: Decimal.Value, yieldPercentage: Decimal.Value): Decimal {
  const yieldFraction = new Decimal(yieldPercentage).dividedBy(100);
  if (yieldFraction.lte(0)) {
    throw new Error("El rendimiento del producto debe ser mayor a 0%.");
  }
  return new Decimal(unitCost).dividedBy(yieldFraction);
}

/**
 * Inverso de applyYieldFactor: a partir de un costo ya ajustado por rendimiento (neto
 * aprovechable), regresa el costo bruto "de compra" (ej. el aguacate entero, sin pelar).
 * Ejemplo: costo neto $37.50/kg con 80% de rendimiento -> $30/kg de producto tal como se compro.
 */
export function removeYieldFactor(unitCost: Decimal.Value, yieldPercentage: Decimal.Value): Decimal {
  const yieldFraction = new Decimal(yieldPercentage).dividedBy(100);
  return new Decimal(unitCost).times(yieldFraction);
}
