import Decimal from "decimal.js";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatPurchaseFolio } from "@/lib/purchases/folio";

export type PurchaseRow = {
  id: string;
  folio: number;
  folioLabel: string;
  dateLabel: string;
  dateValue: number;
  productName: string;
  quantityLabel: string;
  quantityValue: number;
  unitLabel: string;
  supplierName: string | null;
  totalPrice: number;
  unitCostLabel: string;
  unitCostValue: number;
  note: string | null;
  /** Si el producto de esta compra todavia tiene saldo pendiente en algun pedido abierto. */
  hasPendingOrder: boolean;
};

export type PurchaseSortKey = "date" | "product" | "quantity" | "supplier" | "price" | "cost";
export type SortDir = "asc" | "desc";

export const PURCHASE_SORT_KEYS: PurchaseSortKey[] = ["date", "product", "quantity", "supplier", "price", "cost"];

type PurchaseWithRelations = {
  id: string;
  folio: number;
  purchaseDate: Date;
  presentationQty: Decimal;
  presentationUnit: string;
  totalPrice: Decimal;
  computedUnitCost: Decimal;
  note: string | null;
  product: { name: string; baseUnit: string };
  supplier: { name: string } | null;
};

export function toPurchaseRow(purchase: PurchaseWithRelations, hasPendingOrder: boolean): PurchaseRow {
  const baseUnit = purchase.product.baseUnit as UnitValue;
  let quantityInBase: Decimal;
  try {
    quantityInBase = convertQty(purchase.presentationQty, purchase.presentationUnit as UnitValue, baseUnit);
  } catch {
    quantityInBase = new Decimal(purchase.presentationQty);
  }
  const quantityValue = quantityInBase.toNumber();

  return {
    id: purchase.id,
    folio: purchase.folio,
    folioLabel: formatPurchaseFolio(purchase.folio),
    dateLabel: purchase.purchaseDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: purchase.purchaseDate.getTime(),
    productName: purchase.product.name,
    quantityLabel: quantityValue.toLocaleString("es-MX", { maximumFractionDigits: 4 }),
    quantityValue,
    unitLabel: UNIT_LABELS[baseUnit],
    supplierName: purchase.supplier?.name ?? null,
    totalPrice: Number(purchase.totalPrice),
    unitCostLabel: `$${Number(purchase.computedUnitCost).toFixed(4)} / ${UNIT_LABELS[baseUnit]}`,
    unitCostValue: Number(purchase.computedUnitCost),
    note: purchase.note,
    hasPendingOrder,
  };
}

export function purchaseSortValue(row: PurchaseRow, key: PurchaseSortKey): string | number | null {
  switch (key) {
    case "date":
      return row.dateValue;
    case "product":
      return row.productName.toLowerCase();
    case "quantity":
      return row.quantityValue;
    case "supplier":
      return row.supplierName ? row.supplierName.toLowerCase() : null;
    case "price":
      return row.totalPrice;
    case "cost":
      return row.unitCostValue;
  }
}

export function filterPurchaseRows(
  rows: PurchaseRow[],
  params: { search: string; dateFrom: string; dateTo: string; pendingOnly: boolean; supplier: string },
): PurchaseRow[] {
  const q = params.search.trim().toLowerCase();
  const fromValue = params.dateFrom ? new Date(`${params.dateFrom}T00:00:00`).getTime() : null;
  const toValue = params.dateTo ? new Date(`${params.dateTo}T23:59:59.999`).getTime() : null;
  return rows.filter((row) => {
    if (q && !row.productName.toLowerCase().includes(q)) return false;
    if (fromValue !== null && row.dateValue < fromValue) return false;
    if (toValue !== null && row.dateValue > toValue) return false;
    if (params.pendingOnly && !row.hasPendingOrder) return false;
    if (params.supplier && row.supplierName !== params.supplier) return false;
    return true;
  });
}

export function sortPurchaseRows(
  rows: PurchaseRow[],
  sortKey: PurchaseSortKey,
  sortDir: SortDir,
): PurchaseRow[] {
  const dirMultiplier = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = purchaseSortValue(a, sortKey);
    const vb = purchaseSortValue(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb) * dirMultiplier;
    }
    return ((va as number) - (vb as number)) * dirMultiplier;
  });
}
