"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  filterPurchaseRows,
  sortPurchaseRows,
  type PurchaseRow,
  type PurchaseSortKey,
  type SortDir,
} from "./purchase-rows";

export type { PurchaseRow };

const COLUMNS: { key: PurchaseSortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "product", label: "Producto" },
  { key: "quantity", label: "Cantidad" },
  { key: "supplier", label: "Proveedor" },
  { key: "price", label: "Precio" },
  { key: "cost", label: "Costo unitario resultante" },
];

export default function PurchasesTable({ rows }: { rows: PurchaseRow[] }) {
  const [sortKey, setSortKey] = useState<PurchaseSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("");

  const supplierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.supplierName) names.add(row.supplierName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  function handleSort(key: PurchaseSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(
    () => filterPurchaseRows(rows, { search, dateFrom, dateTo, pendingOnly, supplier: supplierFilter }),
    [rows, search, dateFrom, dateTo, pendingOnly, supplierFilter],
  );

  const sortedRows = useMemo(
    () => sortPurchaseRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (pendingOnly) params.set("pendingOnly", "1");
    if (supplierFilter) params.set("supplier", supplierFilter);
    params.set("sortKey", sortKey);
    params.set("sortDir", sortDir);
    return `/api/export/purchases?${params.toString()}`;
  }, [search, dateFrom, dateTo, pendingOnly, supplierFilter, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="space-y-1">
          <label htmlFor="dateFrom" className="text-xs font-medium text-neutral-500">
            Desde
          </label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="dateTo" className="text-xs font-medium text-neutral-500">
            Hasta
          </label>
          <input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Limpiar fechas
          </button>
        )}
        <div className="space-y-1">
          <label htmlFor="supplierFilter" className="text-xs font-medium text-neutral-500">
            Proveedor
          </label>
          <select
            id="supplierFilter"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {supplierOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Productos con pedido pendiente
        </label>
        <a
          href={exportHref}
          className="ml-auto rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Fecha
                  {sortKey === "date" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("product")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Producto
                  {sortKey === "product" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("quantity")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Cantidad
                  {sortKey === "quantity" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Unidad</th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("supplier")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Proveedor
                  {sortKey === "supplier" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("price")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Precio
                  {sortKey === "price" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("cost")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Costo unitario resultante
                  {sortKey === "cost" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "Todavia no hay compras registradas."
                    : "Ninguna compra coincide con los filtros."}
                </td>
              </tr>
            )}
            {sortedRows.map((purchase) => (
              <tr key={purchase.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">
                  <Link href={`/purchases/${purchase.folio}`} className="text-neutral-700 hover:underline">
                    {purchase.folioLabel}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">{purchase.dateLabel}</td>
                <td className="px-4 py-2">
                  {purchase.productName}
                  {purchase.note && <p className="mt-0.5 text-xs text-amber-600">{purchase.note}</p>}
                </td>
                <td className="px-4 py-2 text-neutral-500">{purchase.quantityLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{purchase.unitLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{purchase.supplierName ?? "-"}</td>
                <td className="px-4 py-2">${purchase.totalPrice.toFixed(2)}</td>
                <td className="px-4 py-2">{purchase.unitCostLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
