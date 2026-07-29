"use client";

import { Fragment, useState } from "react";
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
  lineCost: string | null;
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

export default function RecipeIngredientsTable({
  recipeId,
  rows,
}: {
  recipeId: string;
  rows: IngredientRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[23%]" />
          <col className="w-[12%]" />
          <col className="w-[17%]" />
          <col className="w-[20%]" />
          <col className="w-[19%]" />
          <col className="w-8" />
        </colgroup>
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-3 py-1.5 font-medium">Ingrediente</th>
            <th className="px-2 py-1.5 font-medium">Categoria</th>
            <th className="px-3 py-1.5 font-medium text-right">Cantidad</th>
            <th className="px-3 py-1.5 font-medium text-right">Costo unitario</th>
            <th className="px-3 py-1.5 font-medium text-right">Costo total</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-5 text-center text-neutral-400">
                Esta receta todavia no tiene ingredientes.
              </td>
            </tr>
          )}
          {rows.map((row) => {
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
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-800">
                    {row.quantity} {row.unitLabel}
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-800">
                    {row.unitCost ? (
                      row.latestPurchaseFolio ? (
                        <Link
                          href={`/purchases/${row.latestPurchaseFolio}?recipeId=${recipeId}`}
                          target="_blank"
                          className="hover:underline"
                          title="Ver la compra que registro este costo"
                        >
                          ${row.unitCost}
                        </Link>
                      ) : (
                        `$${row.unitCost}`
                      )
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-sm font-semibold text-neutral-900">
                    {row.lineCost ? `$${row.lineCost}` : "-"}
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
                    <td colSpan={6} className="px-3 py-2">
                      {!row.breakdown || row.breakdown.items.length === 0 ? (
                        <p className="text-xs text-neutral-400">Esta subreceta todavia no tiene ingredientes.</p>
                      ) : (
                        <div className="space-y-1 pl-5">
                          <p className="text-xs text-neutral-500">
                            Rendimiento de la subreceta: {row.breakdown.yieldLabel}
                            {row.breakdown.totalCost && ` - Costo total: $${row.breakdown.totalCost}`}
                          </p>
                          <table className="w-full table-fixed text-xs">
                            <colgroup>
                              <col className="w-[27%]" />
                              <col className="w-[14%]" />
                              <col className="w-[18%]" />
                              <col className="w-[21%]" />
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
                                    {sub.quantity} {sub.unitLabel}
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
                                          ${sub.unitCost}
                                        </Link>
                                      ) : (
                                        `$${sub.unitCost}`
                                      )
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td className="py-1 text-right font-semibold text-neutral-800">
                                    {sub.lineCost ? `$${sub.lineCost}` : "-"}
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
