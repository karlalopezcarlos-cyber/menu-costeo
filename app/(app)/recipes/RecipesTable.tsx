"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

export type RecipeRow = {
  id: string;
  name: string;
  categoryName: string | null;
  isMenuItem: boolean;
  yieldQty: number;
  yieldUnitLabel: string;
  cost: number | null;
  costError: string | null;
  costPerUnit: number | null;
  sellingPrice: number | null;
  costPct: number | null;
  itemCount: number;
};

type SortKey = "name" | "category" | "type" | "yield" | "cost" | "costPerUnit" | "sellingPrice" | "costPct";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Nombre" },
  { key: "category", label: "Categoria" },
  { key: "type", label: "Tipo" },
  { key: "yield", label: "Rendimiento" },
  { key: "cost", label: "Costo total" },
  { key: "costPerUnit", label: "Costo por unidad" },
  { key: "sellingPrice", label: "Precio de venta" },
  { key: "costPct", label: "Costo %" },
];

function sortValue(row: RecipeRow, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "category":
      return row.categoryName ? row.categoryName.toLowerCase() : null;
    case "type":
      return row.isMenuItem ? "PLU" : "Subreceta";
    case "yield":
      return row.yieldQty;
    case "cost":
      return row.cost;
    case "costPerUnit":
      return row.costPerUnit;
    case "sellingPrice":
      return row.sellingPrice;
    case "costPct":
      return row.costPct;
  }
}

export default function RecipesTable({ rows }: { rows: RecipeRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
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
  }, [rows, sortKey, sortDir]);

  return (
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
              <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                Todavia no hay recetas.
              </td>
            </tr>
          )}
          {sortedRows.map((recipe) => (
            <tr key={recipe.id} className="border-t border-neutral-100">
              <td className="px-4 py-2">
                <Link href={`/recipes/${recipe.id}`} className="hover:underline">
                  {recipe.name}
                </Link>
                {recipe.itemCount === 0 && (
                  <span
                    title="Esta receta todavia no tiene ingredientes capturados."
                    className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  >
                    Sin ingredientes
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-neutral-500">{recipe.categoryName ?? "-"}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    recipe.isMenuItem ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {recipe.isMenuItem ? "PLU" : "Subreceta"}
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-500">
                {recipe.yieldQty} {recipe.yieldUnitLabel}
              </td>
              <td className="px-4 py-2">
                {recipe.costError ? (
                  <span className="text-red-600">{recipe.costError}</span>
                ) : (
                  formatMoney(recipe.cost!)
                )}
              </td>
              <td className="px-4 py-2">
                {recipe.costPerUnit === null ? "-" : formatMoney(recipe.costPerUnit, 4)}
              </td>
              <td className="px-4 py-2">
                {recipe.sellingPrice === null ? "-" : formatMoney(recipe.sellingPrice)}
              </td>
              <td className="px-4 py-2">
                {recipe.costPct === null ? (
                  "-"
                ) : (
                  <span
                    className={
                      recipe.costPct > 35
                        ? "font-medium text-red-600"
                        : recipe.costPct > 25
                          ? "font-medium text-amber-600"
                          : "font-medium text-green-700"
                    }
                  >
                    {recipe.costPct.toFixed(1)}%
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
