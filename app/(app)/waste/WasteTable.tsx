"use client";

import { useMemo, useState } from "react";
import {
  filterWasteRows,
  sortWasteRows,
  type WasteRow,
  type WasteSortKey,
  type SortDir,
} from "./waste-rows";
import { formatMoney } from "@/lib/format";
import { deleteWasteEntry } from "./actions";

export type { WasteRow };

const COLUMNS: { key: WasteSortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "product", label: "Producto / Subreceta / PLU" },
  { key: "type", label: "Tipo" },
  { key: "category", label: "Categoria" },
  { key: "quantity", label: "Cantidad" },
];

export default function WasteTable({
  rows,
  categoryNames,
}: {
  rows: WasteRow[];
  categoryNames: string[];
}) {
  const [sortKey, setSortKey] = useState<WasteSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasUncategorized = useMemo(() => rows.some((r) => r.categoryName === null), [rows]);

  function handleSort(key: WasteSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(
    () => filterWasteRows(rows, { search, categoryFilter, dateFrom, dateTo }),
    [rows, search, categoryFilter, dateFrom, dateTo],
  );

  const sortedRows = useMemo(
    () => sortWasteRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );

  const totalCost = useMemo(() => filteredRows.reduce((sum, row) => sum + row.cost, 0), [filteredRows]);

  const hasFilters = !!search || categoryFilter !== "all" || !!dateFrom || !!dateTo;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto, subreceta o PLU..."
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
        <p className="text-sm text-neutral-500">Costo total de mermas (filtro actual)</p>
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
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("cost")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Costo
                  {sortKey === "cost" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Comentario</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "Todavia no hay mermas registradas."
                    : "Ninguna merma coincide con los filtros."}
                </td>
              </tr>
            )}
            {sortedRows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{row.dateLabel}</td>
                <td className="px-4 py-2">{row.itemName}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.itemType === "plu"
                        ? "bg-blue-100 text-blue-800"
                        : row.itemType === "subrecipe"
                          ? "bg-neutral-100 text-neutral-600"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {row.itemTypeLabel}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                <td className="px-4 py-2 text-neutral-500">{row.quantityLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{row.unitLabel}</td>
                <td className="px-4 py-2">
                  {formatMoney(row.cost)}
                  {row.costBasisLabel && (
                    <span className="ml-1 text-xs text-amber-600">({row.costBasisLabel})</span>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500">{row.comment ?? "-"}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Eliminar esta merma? Esta accion no se puede deshacer.")) {
                        deleteWasteEntry(row.id);
                      }
                    }}
                    className="text-neutral-400 hover:text-red-600"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
