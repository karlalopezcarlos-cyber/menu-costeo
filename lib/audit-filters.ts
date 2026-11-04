import type { AuditRow } from "@/lib/audit";

/**
 * "counted" deja lo que si se conto al cierre, con o sin variacion; "with" deja solo lo que hay
 * que revisar; "without" solo lo que cuadro, que es el mismo conjunto que la tabla pinta de
 * verde. Las tres opciones piden conteo final, asi que un renglon sin conteo no aparece en
 * ninguna: no se midio su variacion, y decir que cuadra seria inventarlo.
 */
export type VarianceFilter = "all" | "counted" | "with" | "without";

export type AuditRowFilters = {
  search: string;
  typeFilter: "all" | "product" | "subrecipe";
  categoryFilter: string;
  varianceFilter: VarianceFilter;
  onlyDifferences: boolean;
  onlyWithComment: boolean;
};

/** La misma tolerancia con la que la tabla decide el color: debajo de esto, cuadro. */
export function hasRealVariance(row: AuditRow): boolean | null {
  if (row.varianceQty === null) return null;
  return Math.abs(row.varianceQty) > 0.001;
}

/**
 * Si al renglon le paso algo en el periodo. Sirve para dos cosas: esconderlo con "Solo con
 * movimiento o variacion", y decidir si pintarlo de verde cuando cuadra (un producto que no se
 * movio no "cuadro", simplemente no participo).
 */
export function rowHasActivity(row: AuditRow): boolean {
  return (
    row.initialQty !== 0 ||
    row.purchasesQty !== 0 ||
    row.producedQty !== 0 ||
    row.transformedInQty !== 0 ||
    row.wasteQty !== 0 ||
    row.productionConsumedQty !== 0 ||
    row.transformedOutQty !== 0 ||
    row.salesQty !== 0
  );
}

/** Filtro compartido entre la tabla (cliente) y la exportacion a PDF (servidor) para que ambos vean exactamente las mismas filas. */
export function filterAuditRows(rows: AuditRow[], filters: AuditRowFilters): AuditRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (filters.typeFilter !== "all" && row.itemType !== filters.typeFilter) return false;
    if (filters.categoryFilter === "none" && row.categoryName !== null) return false;
    if (
      filters.categoryFilter !== "all" &&
      filters.categoryFilter !== "none" &&
      row.categoryName !== filters.categoryFilter
    ) {
      return false;
    }
    if (filters.varianceFilter !== "all") {
      // null es "no se conto al cierre", y eso basta para descartarlo en las tres opciones;
      // "counted" no necesita mas que eso.
      const real = hasRealVariance(row);
      if (real === null) return false;
      if (filters.varianceFilter === "with" && !real) return false;
      if (filters.varianceFilter === "without" && real) return false;
    }
    if (filters.onlyDifferences) {
      const hasVariance = row.varianceQty !== null && Math.abs(row.varianceQty) > 0.001;
      if (!rowHasActivity(row) && !hasVariance) return false;
    }
    if (filters.onlyWithComment && !row.comment) return false;
    return true;
  });
}

/**
 * Que tanto pesa un monto de variacion sobre la venta del periodo. Vive aqui, junto al filtro,
 * porque el numerador sale de las filas visibles y el denominador no: la pantalla y el PDF
 * tienen que calcularlo igual o el mismo periodo da dos porcentajes distintos.
 *
 * Devuelve null cuando no hubo venta. Dividir entre cero no da "0%": da que la pregunta no
 * aplica, y pintar 0% ahi diria que no hay problema justo cuando hay faltante sin venta.
 */
export function varianceSharePct(amount: number, salesTotal: number): number | null {
  if (!salesTotal) return null;
  return (amount / salesTotal) * 100;
}

export function sumVarianceAmounts(rows: AuditRow[]): { totalShortageAmount: number; totalSurplusAmount: number } {
  let totalShortageAmount = 0;
  let totalSurplusAmount = 0;
  for (const row of rows) {
    if (row.varianceAmount === null) continue;
    if (row.varianceAmount < 0) totalShortageAmount += -row.varianceAmount;
    else if (row.varianceAmount > 0) totalSurplusAmount += row.varianceAmount;
  }
  return { totalShortageAmount, totalSurplusAmount };
}
