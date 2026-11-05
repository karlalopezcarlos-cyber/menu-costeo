"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

import {
  BADGE_CLASSES,
  CLASSIFICATION_ICONS,
  CLASSIFICATION_LABELS,
  type IvaMode,
  type MenuEngineeringRowView,
} from "@/lib/menu-engineering-view";

type SortKey = "name" | "quantitySold" | "unitPrice" | "cost" | "margin" | "costPct" | "popularity" | "classification";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: (ivaMode: IvaMode) => string }[] = [
  { key: "name", label: () => "Platillo" },
  { key: "quantitySold", label: () => "Cantidad vendida" },
  { key: "unitPrice", label: (iva) => `Precio${iva === "sin" ? " (sin IVA)" : ""}` },
  { key: "cost", label: () => "Costo total" },
  { key: "margin", label: () => "Margen total" },
  { key: "costPct", label: () => "Costo %" },
  { key: "popularity", label: () => "% Popularidad" },
  { key: "classification", label: () => "Clasificacion" },
];

function sortValue(row: MenuEngineeringRowView, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return row.recipeName.toLowerCase();
    case "quantitySold":
      return row.quantitySold;
    case "unitPrice":
      return row.unitPrice;
    case "cost":
      // Misma regla que en el margen: la columna muestra el costo del periodo, asi que
      // ordenar por ella ordena por eso.
      return row.totalCost;
    case "margin":
      // La columna muestra el margen del periodo, asi que ordenar por ella tiene que ordenar
      // por eso mismo y no por el unitario, que es un ranking distinto.
      return row.totalMargin;
    case "costPct":
      return row.costPct;
    case "popularity":
      return row.popularity;
    case "classification":
      // Los sin clasificar al final: son tarea pendiente, no un quinto cuadrante.
      return row.classification ? CLASSIFICATION_LABELS[row.classification] : "zzz";
  }
}

export default function MenuEngineeringTable({
  rows,
  ivaMode,
}: {
  rows: MenuEngineeringRowView[];
  ivaMode: IvaMode;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("quantitySold");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
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
  }, [rows, sortKey, sortDir]);

  // Las filas llegan ya filtradas por la vista: tabla y matriz comparten el mismo filtro para
  // que nunca muestren conjuntos distintos.
  const visibleRows = sortedRows;

  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, row) => ({
          quantitySold: acc.quantitySold + row.quantitySold,
          totalCost: acc.totalCost + row.totalCost,
          totalMargin: acc.totalMargin + row.totalMargin,
        }),
        { quantitySold: 0, totalCost: 0, totalMargin: 0 },
      ),
    [visibleRows],
  );

  const sinCostear = visibleRows.filter((row) => row.costUnreliable).length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          {/* top-16, no top-0: la barra de la app es sticky y mide h-16, asi que con
              top-0 el encabezado de la tabla se metia debajo de ella al bajar y dejaba
              de verse justo cuando mas se necesita. */}
          <thead className="sticky top-16 z-10 bg-neutral-900 text-left text-white">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-neutral-300"
                  >
                    {col.label(ivaMode)}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-neutral-400">
                  Ningun platillo coincide con el filtro.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={row.recipeId} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  {row.recipeName}
                  {row.costUnreliable && (
                    <span title={row.costIssues.join("\n")} className="ml-2 text-amber-500">
                      ⚠
                    </span>
                  )}
                  {row.costUnreliable && row.costIssues.length > 0 && (
                    <p className="mt-0.5 text-xs text-amber-600">{row.costIssues[0]}</p>
                  )}
                </td>
                <td className="px-4 py-3">{row.quantitySold}</td>
                <td className="px-4 py-3">{formatMoney(row.unitPrice)}</td>
                <td className="px-4 py-3">
                  {formatMoney(row.totalCost)}
                  <p className="text-xs text-neutral-400">{formatMoney(row.cost)} c/u</p>
                </td>
                <td className="px-4 py-3">
                  {formatMoney(row.totalMargin)}
                  {/* El unitario se queda a la vista en chico: es el que decide la clasificacion
                      de la ultima columna, y sin el la etiqueta parece salida de la nada. */}
                  <p className="text-xs text-neutral-400">{formatMoney(row.margin)} c/u</p>
                </td>
                <td className="px-4 py-3">
                  {row.costPct !== null ? (
                    <span
                      className={
                        row.costPct > 35
                          ? "font-medium text-red-600"
                          : row.costPct > 25
                            ? "font-medium text-amber-600"
                            : "font-medium text-green-700"
                      }
                    >
                      {row.costPct.toFixed(1)}%
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">{(row.popularity * 100).toFixed(1)}%</td>
                <td className="px-4 py-3">
                  {row.classification ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[row.classification]}`}>
                      {CLASSIFICATION_ICONS[row.classification]} {CLASSIFICATION_LABELS[row.classification]}
                    </span>
                  ) : (
                    <span
                      title={row.costIssues.join("\n")}
                      className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                    >
                      ⚠ Revisar receta
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
              <tr>
                <td className="px-4 py-3">Total del periodo</td>
                <td className="px-4 py-3">{totals.quantitySold}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3">{formatMoney(totals.totalCost)}</td>
                <td className="px-4 py-3">{formatMoney(totals.totalMargin)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {sinCostear > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {sinCostear === 1
            ? "1 platillo no se pudo costear completo"
            : `${sinCostear} platillos no se pudieron costear completos`}{" "}
          y por eso quedaron sin clasificar. Su margen aparece mas alto de lo real, asi que el
          total de arriba esta sobrestimado. No entraron al promedio con el que se clasifico a
          los demas, para que un costo incompleto no reclasifique platillos que si estan bien.
        </p>
      )}
    </div>
  );
}
