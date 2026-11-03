import Decimal from "decimal.js";

/**
 * Impuestos de compra, calculados y nunca guardados como monto.
 *
 * Lo que se guarda son las tasas; los montos salen de ellas cada vez. Guardar los montos
 * dejaria dos fuentes de verdad que se separan en cuanto alguien corrige un precio.
 *
 * El costo del negocio es SIEMPRE el subtotal: el IVA de compras es acreditable y no es costo.
 * Por eso nada de aqui entra al costeo de recetas, al inventario ni al costo de ventas; sirve
 * para cuadrar contra la factura del proveedor y para saber cuanto hay que pagarle.
 */
export type TaxRates = {
  /** En por ciento: 16, no 0.16. */
  ivaRate: number;
  iepsRate: number;
};

export type TaxBreakdown = {
  subtotal: number;
  ieps: number;
  iva: number;
  /** Lo que se le paga al proveedor. */
  total: number;
};

/**
 * El IEPS se calcula sobre el subtotal y despues forma parte de la base del IVA, como en la
 * ley: el IVA de una cerveza se cobra sobre el precio ya con IEPS, no sobre el precio pelon.
 */
export function computeTaxes(subtotal: Decimal.Value, rates: TaxRates): TaxBreakdown {
  const base = new Decimal(subtotal);
  const ieps = base.times(rates.iepsRate).dividedBy(100);
  const iva = base.plus(ieps).times(rates.ivaRate).dividedBy(100);
  return {
    subtotal: base.toNumber(),
    ieps: ieps.toNumber(),
    iva: iva.toNumber(),
    total: base.plus(ieps).plus(iva).toNumber(),
  };
}

export function emptyBreakdown(): TaxBreakdown {
  return { subtotal: 0, ieps: 0, iva: 0, total: 0 };
}

/** Suma renglon por renglon, porque cada uno puede traer tasas distintas. */
export function sumTaxes(items: { subtotal: Decimal.Value; rates: TaxRates }[]): TaxBreakdown {
  const total = emptyBreakdown();
  for (const item of items) {
    const parcial = computeTaxes(item.subtotal, item.rates);
    total.subtotal += parcial.subtotal;
    total.ieps += parcial.ieps;
    total.iva += parcial.iva;
    total.total += parcial.total;
  }
  return total;
}

/** Para los selectores del alta de productos. La tasa libre se sigue pudiendo teclear. */
export const TASAS_IVA_COMUNES = [16, 8, 0];
