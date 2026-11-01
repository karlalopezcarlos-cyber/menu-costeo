import type { AuditRow } from "@/lib/audit";

export type AuditRowFilters = {
  search: string;
  typeFilter: "all" | "product" | "subrecipe";
  categoryFilter: string;
  onlyDifferences: boolean;
  onlyWithComment: boolean;
};

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
    if (filters.onlyDifferences) {
      const hasVariance = row.varianceQty !== null && Math.abs(row.varianceQty) > 0.001;
      if (!rowHasActivity(row) && !hasVariance) return false;
    }
    if (filters.onlyWithComment && !row.comment) return false;
    return true;
  });
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
