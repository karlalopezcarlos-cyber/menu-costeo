"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { archiveProduct, restoreProduct } from "./actions";
import { formatMoney } from "@/lib/format";

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
          className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-neutral-400"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 shadow-xs"
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
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className="flex items-center gap-1.5 transition-colors hover:text-neutral-900"
                >
                  {col.label}
                  <span className={sortKey === col.key ? "text-brand-500" : "text-transparent"}>
                    {sortKey === col.key && sortDir === "desc" ? "▼" : "▲"}
                  </span>
                </button>
              </th>
            ))}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
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
              <tr
                key={product.id}
                className="border-t border-neutral-100 transition-colors hover:bg-neutral-50"
              >
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {showArchived ? (
                    product.name
                  ) : (
                    <Link
                      href={`/products/${product.id}/edit`}
                      className="transition-colors hover:text-brand-600"
                    >
                      {product.name}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">
                  {product.categoryName ? (
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                      {product.categoryName}
                    </span>
                  ) : (
                    <span className="text-neutral-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">{product.baseUnitLabel}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {product.yieldPercentage === 100 ? (
                    <span className="text-neutral-400">-</span>
                  ) : (
                    `${product.yieldPercentage}%`
                  )}
                </td>
                <td className="px-4 py-3">
                  {product.currentUnitCost === null ? (
                    <span className="text-neutral-400">Sin compras</span>
                  ) : (
                    <span className="font-medium text-neutral-900">
                      {formatMoney(product.currentUnitCost, 4)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={action}>
                    <button
                      type="submit"
                      className={
                        showArchived
                          ? "text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                          : "text-sm font-medium text-neutral-400 transition-colors hover:text-red-600"
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
