"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { archiveProduct, restoreProduct } from "./actions";

export type ProductRow = {
  id: string;
  name: string;
  categoryName: string | null;
  baseUnitLabel: string;
  yieldPercentage: number;
  currentUnitCost: number | null;
};

type SortKey = "name" | "category" | "unit" | "yield" | "cost";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "category", label: "Categoria" },
  { key: "unit", label: "Unidad base" },
  { key: "yield", label: "Rendimiento" },
  { key: "cost", label: "Costo vigente" },
];

function sortValue(row: ProductRow, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "category":
      return row.categoryName ? row.categoryName.toLowerCase() : null;
    case "unit":
      return row.baseUnitLabel;
    case "yield":
      return row.yieldPercentage;
    case "cost":
      return row.currentUnitCost;
  }
}

export default function ProductsTable({
  rows,
  showArchived,
}: {
  rows: ProductRow[];
  showArchived: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return {
      names: [...names].sort((a, b) => a.localeCompare(b)),
      hasUncategorized,
    };
  }, [rows]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      if (categoryFilter === "none" && row.categoryName !== null) return false;
      if (
        categoryFilter !== "all" &&
        categoryFilter !== "none" &&
        row.categoryName !== categoryFilter
      )
        return false;
      return true;
    });
  }, [rows, search, categoryFilter]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
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
  }, [filteredRows, sortKey, sortDir]);

  return (
    <div className="space-y-3">
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
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                {rows.length === 0
                  ? showArchived
                    ? "No hay productos archivados."
                    : "Todavia no hay productos. Agrega el primero."
                  : "Ningun producto coincide con los filtros."}
              </td>
            </tr>
          )}
          {sortedRows.map((product) => {
            const action = showArchived
              ? restoreProduct.bind(null, product.id)
              : archiveProduct.bind(null, product.id);
            return (
              <tr key={product.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {showArchived ? (
                    product.name
                  ) : (
                    <Link href={`/products/${product.id}/edit`} className="hover:underline">
                      {product.name}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500">{product.categoryName ?? "-"}</td>
                <td className="px-4 py-2">{product.baseUnitLabel}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {product.yieldPercentage === 100 ? "-" : `${product.yieldPercentage}%`}
                </td>
                <td className="px-4 py-2">
                  {product.currentUnitCost === null ? "Sin compras" : `$${product.currentUnitCost.toFixed(4)}`}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={action}>
                    <button
                      type="submit"
                      className={
                        showArchived
                          ? "text-neutral-500 hover:text-neutral-900"
                          : "text-neutral-400 hover:text-red-600"
                      }
                    >
                      {showArchived ? "Restaurar" : "Archivar"}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
