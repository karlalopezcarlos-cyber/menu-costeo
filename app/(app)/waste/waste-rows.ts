export type WasteRow = {
  id: string;
  dateLabel: string;
  dateValue: number;
  productName: string;
  categoryName: string | null;
  quantityLabel: string;
  quantityValue: number;
  unitLabel: string;
  comment: string | null;
  cost: number;
  costBasisLabel: string | null;
};

export type WasteSortKey = "date" | "product" | "category" | "quantity" | "cost";
export type SortDir = "asc" | "desc";

export function wasteSortValue(row: WasteRow, key: WasteSortKey): string | number | null {
  switch (key) {
    case "date":
      return row.dateValue;
    case "product":
      return row.productName.toLowerCase();
    case "category":
      return row.categoryName ? row.categoryName.toLowerCase() : null;
    case "quantity":
      return row.quantityValue;
    case "cost":
      return row.cost;
  }
}

export function filterWasteRows(
  rows: WasteRow[],
  params: { search: string; categoryFilter: string; dateFrom: string; dateTo: string },
): WasteRow[] {
  const q = params.search.trim().toLowerCase();
  const fromValue = params.dateFrom ? new Date(`${params.dateFrom}T00:00:00`).getTime() : null;
  const toValue = params.dateTo ? new Date(`${params.dateTo}T23:59:59.999`).getTime() : null;
  return rows.filter((row) => {
    if (q && !row.productName.toLowerCase().includes(q)) return false;
    if (params.categoryFilter === "none" && row.categoryName !== null) return false;
    if (
      params.categoryFilter !== "all" &&
      params.categoryFilter !== "none" &&
      row.categoryName !== params.categoryFilter
    ) {
      return false;
    }
    if (fromValue !== null && row.dateValue < fromValue) return false;
    if (toValue !== null && row.dateValue > toValue) return false;
    return true;
  });
}

export function sortWasteRows(rows: WasteRow[], sortKey: WasteSortKey, sortDir: SortDir): WasteRow[] {
  const dirMultiplier = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = wasteSortValue(a, sortKey);
    const vb = wasteSortValue(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dirMultiplier;
    }
    return ((va as number) - (vb as number)) * dirMultiplier;
  });
}
