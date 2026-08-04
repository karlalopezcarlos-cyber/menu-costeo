"use client";

import { useMemo, useState } from "react";
import {
  filterProductionRows,
  sortProductionRows,
  type ProductionRow,
  type ProductionSortKey,
  type SortDir,
} from "./production-rows";
import { formatMoney } from "@/lib/format";

export type { ProductionRow };

const COLUMNS: { key: ProductionSortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "subRecipe", label: "Subreceta" },
  { key: "category", label: "Categoria" },
  { key: "quantity", label: "Cantidad" },
];

const COLUMNS_AFTER_UNIT: { key: ProductionSortKey; label: string }[] = [
  { key: "unitCost", label: "Costo unitario" },
  { key: "total", label: "Total" },
];

export default function ProductionTable({
  rows,
  categoryNames,
}: {
  rows: ProductionRow[];
  categoryNames: string[];
}) {
  const [sortKey, setSortKey] = useState<ProductionSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasUncategorized = useMemo(() => rows.some((r) => r.categoryName === null), [rows]);

  function handleSort(key: ProductionSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(
    () => filterProductionRows(rows, { search, categoryFilter, dateFrom, dateTo }),
    [rows, search, categoryFilter, dateFrom, dateTo],
  );

  const sortedRows = useMemo(
    () => sortProductionRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const totalCost = useMemo(() => filteredRows.reduce((sum, row) => sum + row.total, 0), [filteredRows]);

  const hasFilters = !!search || categoryFilter !== "all" || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar subreceta..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          {categoryNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {hasUncategorized && <option value="none">Sin categoria</option>}
        </select>
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
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Costo total de produccion (filtro actual)</p>
        <p className="text-xl font-semibold text-neutral-900">{formatMoney(totalCost)}</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-neutral-900"
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Unidad</th>
              {COLUMNS_AFTER_UNIT.map((col) => (
                <th key={col.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-neutral-900"
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "Todavia no hay producciones registradas."
                    : "Ninguna produccion coincide con los filtros."}
                </td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{row.dateLabel}</td>
                <td className="px-4 py-2">{row.subRecipeName}</td>
                <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                <td className="px-4 py-2 text-neutral-500">{row.quantityLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{row.unitLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{row.unitCostLabel}</td>
                <td className="px-4 py-2">{formatMoney(row.total)}</td>
                <td className="px-4 py-2 text-neutral-500">{row.comment ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
