"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { removeRecipeItem } from "../actions";

export type IngredientRow = {
  id: string;
  label: string;
  isSubRecipe: boolean;
  subRecipeId: string | null;
  /** Categoria del producto (catalogo), null si es subreceta o el producto no tiene categoria. */
  categoryName: string | null;
  quantity: string;
  unitLabel: string;
  unitCost: string | null;
  unitCostValue: number | null;
  lineCost: string | null;
  lineCostValue: number | null;
  /** Folio de la ultima compra de este producto (la que determina su costo actual), si aplica. */
  latestPurchaseFolio: number | null;
  breakdown?: {
    yieldLabel: string;
    totalCost: string | null;
    items: {
      label: string;
      isSubRecipe: boolean;
      categoryName: string | null;
      quantity: string;
      unitLabel: string;
      unitCost: string | null;
      lineCost: string | null;
      latestPurchaseFolio: number | null;
    }[];
  };
};

type SortKey = "label" | "categoryName" | "quantity" | "unitLabel" | "unitCostValue" | "lineCostValue";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "label", label: "Ingrediente", align: "left" },
  { key: "categoryName", label: "Categoria", align: "left" },
  { key: "quantity", label: "Cantidad", align: "right" },
  { key: "unitLabel", label: "Unidad", align: "right" },
  { key: "unitCostValue", label: "Costo unitario", align: "right" },
  { key: "lineCostValue", label: "Costo total", align: "right" },
];

function sortValue(row: IngredientRow, key: SortKey): string | number | null {
  switch (key) {
    case "label":
      return row.label.toLowerCase();
    case "categoryName":
      return row.categoryName?.toLowerCase() ?? null;
    case "quantity":
      return Number(row.quantity);
    case "unitLabel":
      return row.unitLabel.toLowerCase();
    case "unitCostValue":
      return row.unitCostValue;
    case "lineCostValue":
      return row.lineCostValue;
  }
}

export default function RecipeIngredientsTable({
  recipeId,
  rows,
}: {
  recipeId: string;
  rows: IngredientRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter(
          (r) => r.label.toLowerCase().includes(term) || (r.categoryName?.toLowerCase().includes(term) ?? false),
        )
      : rows;

    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
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
  }, [rows, search, sortKey, sortDir]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      {rows.length > 0 && (
        <div className="border-b border-neutral-100 px-3 py-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ingrediente o categoria..."
            className="w-full max-w-xs rounded-md border border-neutral-300 px-2.5 py-1.5 text-[13px]"
          />
        </div>
      )}
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[11%]" />
          <col className="w-[19%]" />
          <col className="w-[19%]" />
          <col className="w-8" />
        </colgroup>
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-1.5 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className={`inline-flex items-center gap-1 hover:text-neutral-900 ${col.align === "right" ? "flex-row-reverse" : ""}`}
                >
                  {col.label}
                  {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-5 text-center text-neutral-400">
                Esta receta todavia no tiene ingredientes.
              </td>
            </tr>
          )}
          {rows.length > 0 && visibleRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-5 text-center text-neutral-400">
                Ningun ingrediente coincide con la busqueda.
              </td>
            </tr>
          )}
          {visibleRows.map((row) => {
            const isExpanded = expanded.has(row.id);
            const removeAction = removeRecipeItem.bind(null, recipeId, row.id);
            return (
              <Fragment key={row.id}>
                <tr className="border-t border-neutral-100 hover:bg-neutral-50/60">
                  <td className="truncate px-3 py-1.5">
                    <span className="inline-flex w-3.5 shrink-0 justify-center align-middle">
                      {row.isSubRecipe && (
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          aria-label={isExpanded ? "Contraer desglose" : "Expandir desglose"}
                          className="text-neutral-400 hover:text-neutral-900"
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      )}
                    </span>
                    {row.isSubRecipe && row.subRecipeId ? (
                      <Link href={`/recipes/${row.subRecipeId}`} target="_blank" className="hover:underline">
                        {row.label}
                      </Link>
                    ) : (
                      <span>{row.label}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.isSubRecipe ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                        Subreceta
                      </span>
                    ) : (
                      row.categoryName && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                          {row.categoryName}
                        </span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-800">{row.quantity}</td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-800">{row.unitLabel}</td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-800">
                    {row.unitCost ? (
                      row.latestPurchaseFolio ? (
                        <Link
                          href={`/purchases/${row.latestPurchaseFolio}?recipeId=${recipeId}`}
                          target="_blank"
                          className="hover:underline"
                          title="Ver la compra que registro este costo"
                        >
                          {row.unitCost}
                        </Link>
                      ) : (
                        row.unitCost
                      )
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-900">
                    {row.lineCost ? row.lineCost : "-"}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <form action={removeAction}>
                      <button
                        type="submit"
                        title="Quitar ingrediente"
                        aria-label="Quitar ingrediente"
                        className="text-neutral-300 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </form>
                  </td>
                </tr>
                {row.isSubRecipe && isExpanded && (
                  <tr className="border-t border-neutral-100 bg-neutral-50">
                    <td colSpan={7} className="px-3 py-2">
                      {!row.breakdown || row.breakdown.items.length === 0 ? (
                        <p className="text-xs text-neutral-400">Esta subreceta todavia no tiene ingredientes.</p>
                      ) : (
                        <div className="space-y-1 pl-5">
                          <p className="text-xs text-neutral-500">
                            Rendimiento de la subreceta: {row.breakdown.yieldLabel}
                            {row.breakdown.totalCost && ` - Costo total: ${row.breakdown.totalCost}`}
                          </p>
                          <table className="w-full table-fixed text-xs">
                            <colgroup>
                              <col className="w-[24%]" />
                              <col className="w-[13%]" />
                              <col className="w-[12%]" />
                              <col className="w-[11%]" />
                              <col className="w-[20%]" />
                              <col className="w-[20%]" />
                            </colgroup>
                            <tbody>
                              {row.breakdown.items.map((sub, i) => (
                                <tr key={i} className="border-t border-neutral-200">
                                  <td className="truncate py-1 pr-3">{sub.label}</td>
                                  <td className="py-1 pr-3">
                                    {sub.isSubRecipe ? (
                                      <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">
                                        Subreceta
                                      </span>
                                    ) : (
                                      sub.categoryName && (
                                        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">
                                          {sub.categoryName}
                                        </span>
                                      )
                                    )}
                                  </td>
                                  <td className="py-1 pr-3 text-right font-medium text-neutral-700">
                                    {sub.quantity}
                                  </td>
                                  <td className="py-1 pr-3 text-right font-medium text-neutral-700">
                                    {sub.unitLabel}
                                  </td>
                                  <td className="py-1 pr-3 text-right font-medium text-neutral-700">
                                    {sub.unitCost ? (
                                      sub.latestPurchaseFolio ? (
                                        <Link
                                          href={`/purchases/${sub.latestPurchaseFolio}?recipeId=${recipeId}`}
                                          target="_blank"
                                          className="hover:underline"
                                          title="Ver la compra que registro este costo"
                                        >
                                          {sub.unitCost}
                                        </Link>
                                      ) : (
                                        sub.unitCost
                                      )
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="py-1 text-right font-semibold text-neutral-800">
                                    {sub.lineCost ? sub.lineCost : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
