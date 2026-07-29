export type ProductionRow = {
  id: string;
  dateLabel: string;
  dateValue: number;
  subRecipeName: string;
  categoryName: string | null;
  quantityLabel: string;
  quantityValue: number;
  unitLabel: string;
  unitCostLabel: string;
  unitCostValue: number;
  total: number;
  comment: string | null;
};

export type ProductionSortKey = "date" | "subRecipe" | "category" | "quantity" | "unitCost" | "total";
export type SortDir = "asc" | "desc";

export function productionSortValue(row: ProductionRow, key: ProductionSortKey): string | number | null {
  switch (key) {
    case "date":
      return row.dateValue;
    case "subRecipe":
      return row.subRecipeName.toLowerCase();
    case "category":
      return row.categoryName ? row.categoryName.toLowerCase() : null;
    case "quantity":
      return row.quantityValue;
    case "unitCost":
      return row.unitCostValue;
    case "total":
      return row.total;
  }
}

export function filterProductionRows(
  rows: ProductionRow[],
  params: { search: string; categoryFilter: string; dateFrom: string; dateTo: string },
): ProductionRow[] {
  const q = params.search.trim().toLowerCase();
  const fromValue = params.dateFrom ? new Date(`${params.dateFrom}T00:00:00`).getTime() : null;
  const toValue = params.dateTo ? new Date(`${params.dateTo}T23:59:59.999`).getTime() : null;
  return rows.filter((row) => {
    if (q && !row.subRecipeName.toLowerCase().includes(q)) return false;
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

export function sortProductionRows(
  rows: ProductionRow[],
  sortKey: ProductionSortKey,
  sortDir: SortDir,
): ProductionRow[] {
  const dirMultiplier = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = productionSortValue(a, sortKey);
    const vb = productionSortValue(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dirMultiplier;
    }
    return ((va as number) - (vb as number)) * dirMultiplier;
  });
}
