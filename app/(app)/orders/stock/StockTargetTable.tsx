"use client";

import { useMemo, useState } from "react";
import { saveStockTargets } from "./actions";

export type StockRow = {
  id: string;
  name: string;
  categoryName: string | null;
  unitLabel: string;
  currentStock: number | null;
  targetStock: number;
};

type SortKey = "category" | "name" | "current" | "target";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "category", label: "Categoria" },
  { key: "name", label: "Nombre" },
  { key: "current", label: "Stock actual" },
  { key: "target", label: "Stock objetivo" },
];

export default function StockTargetTable({ rows }: { rows: StockRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.targetStock ? String(r.targetStock) : ""])),
  );

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasUncategorized };
  }, [rows]);

  function matchesFilter(row: StockRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (categoryFilter === "none" && row.categoryName !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
      return false;
    }
    return true;
  }

  function targetOf(row: StockRow): number {
    const raw = targets[row.id];
    const n = Number(raw);
    return raw && !Number.isNaN(n) ? n : 0;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortValue(row: StockRow, key: SortKey): string | number | null {
    switch (key) {
      case "category":
        return row.categoryName ? row.categoryName.toLowerCase() : null;
      case "name":
        return row.name.toLowerCase();
      case "current":
        return row.currentStock;
      case "target":
        return targetOf(row);
    }
  }

  const sortedRows = useMemo(() => {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dirMultiplier;
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, targets]);

  const visibleCount = sortedRows.filter(matchesFilter).length;

  return (
    <form action={saveStockTargets} className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">
          Los productos sin stock objetivo (0) no apareceran en pedidos sugeridos.
        </p>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          {categoryOptions.names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {categoryOptions.hasUncategorized && <option value="none">Sin categoria</option>}
        </select>
        {(search || categoryFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtros
          </button>
        )}
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
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay productos activos.
                </td>
              </tr>
            )}
            {sortedRows.length > 0 && visibleCount === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const visible = matchesFilter(row);
              return (
                <tr key={row.id} className={visible ? "border-t border-neutral-100" : "hidden"}>
                  <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {row.currentStock !== null ? `${row.currentStock} ${row.unitLabel}` : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        name={`target:${row.id}`}
                        type="number"
                        step="any"
                        min="0"
                        value={targets[row.id] ?? ""}
                        onChange={(e) =>
                          setTargets((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <span className="text-neutral-400">{row.unitLabel}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
