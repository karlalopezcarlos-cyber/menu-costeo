import Decimal from "decimal.js";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatPurchaseFolio } from "@/lib/purchases/folio";
import { formatMoney } from "@/lib/format";

export type PurchaseRow = {
  id: string;
  folio: number;
  folioLabel: string;
  productId: string;
  dateLabel: string;
  dateValue: number;
  /** Momento de creacion del registro: desempata compras con la misma fecha al calcular tendencia de costo. */
  createdAtValue: number;
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

export type CostTrend = "up" | "down" | "flat";

export type PurchaseSortKey = "folio" | "date" | "product" | "quantity" | "supplier" | "price" | "cost";
export type SortDir = "asc" | "desc";

export const PURCHASE_SORT_KEYS: PurchaseSortKey[] = [
  "folio",
  "date",
  "product",
  "quantity",
  "supplier",
  "price",
  "cost",
];

type PurchaseWithRelations = {
  id: string;
  folio: number;
  productId: string;
  purchaseDate: Date;
  createdAt: Date;
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
    productId: purchase.productId,
    dateLabel: purchase.purchaseDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: purchase.purchaseDate.getTime(),
    createdAtValue: purchase.createdAt.getTime(),
    productName: purchase.product.name,
    quantityLabel: quantityValue.toLocaleString("es-MX", { maximumFractionDigits: 4 }),
    quantityValue,
    unitLabel: UNIT_LABELS[baseUnit],
    supplierName: purchase.supplier?.name ?? null,
    totalPrice: Number(purchase.totalPrice),
    unitCostLabel: `${formatMoney(Number(purchase.computedUnitCost), 4)} / ${UNIT_LABELS[baseUnit]}`,
    unitCostValue: Number(purchase.computedUnitCost),
    note: purchase.note,
    hasPendingOrder,
  };
}

export function purchaseSortValue(row: PurchaseRow, key: PurchaseSortKey): string | number | null {
  switch (key) {
    case "folio":
      return row.folio;
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

/**
 * Para cada compra, compara su costo unitario contra el promedio de costo de ese mismo producto
 * dentro de todo el conjunto recibido (ej. ya filtrado por busqueda/periodo/proveedor), para marcar
 * si esta por encima, por debajo o igual al promedio del periodo visible.
 */
export function computeCostTrends(rows: PurchaseRow[]): Map<string, CostTrend> {
  const trends = new Map<string, CostTrend>();
  const byProduct = new Map<string, PurchaseRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }
  for (const list of byProduct.values()) {
    const average = list.reduce((sum, r) => sum + r.unitCostValue, 0) / list.length;
    // Tolerancia minima para no marcar como "distinto" diferencias de redondeo insignificantes.
    const tolerance = Math.abs(average) * 0.0005;
    for (const row of list) {
      const diff = row.unitCostValue - average;
      const trend: CostTrend = diff > tolerance ? "up" : diff < -tolerance ? "down" : "flat";
      trends.set(row.id, trend);
    }
  }
  return trends;
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
