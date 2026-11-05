"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

// No importamos lib/menu-engineering aqui (aunque sea solo por tipos): ese modulo carga
// @/lib/prisma en su cadena de imports, lo cual rompe el bundle de cliente. Duplicamos las
// constantes minimas que necesita esta tabla.
export type MenuEngineeringClassification = "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG";
export type IvaMode = "con" | "sin";

const CLASSIFICATION_LABELS: Record<MenuEngineeringClassification, string> = {
  STAR: "Estrella",
  PLOWHORSE: "Caballo de batalla",
  PUZZLE: "Acertijo",
  DOG: "Perro",
};

const BADGE_CLASSES: Record<MenuEngineeringClassification, string> = {
  STAR: "bg-green-100 text-green-800",
  PLOWHORSE: "bg-blue-100 text-blue-800",
  PUZZLE: "bg-amber-100 text-amber-800",
  DOG: "bg-red-100 text-red-800",
};

/** De mejor a peor, que es como se lee el reporte y como conviene ofrecerlas en el filtro. */
const CLASSIFICATION_ORDER: MenuEngineeringClassification[] = ["STAR", "PLOWHORSE", "PUZZLE", "DOG"];

const CLASSIFICATION_ICONS: Record<MenuEngineeringClassification, string> = {
  STAR: "⭐",
  PLOWHORSE: "🐴",
  PUZZLE: "🧩",
  DOG: "🐶",
};

/** Version con numeros planos de MenuEngineeringRow (Decimal.js no es serializable de Server a
 * Client Component), armada en page.tsx antes de pasarla a esta tabla. */
export type MenuEngineeringRowView = {
  recipeId: string;
  recipeName: string;
  quantitySold: number;
  unitPrice: number;
  cost: number;
  margin: number;
  totalMargin: number;
  costPct: number | null;
  popularity: number;
  classification: MenuEngineeringClassification;
  costUnreliable: boolean;
};

type SortKey = "name" | "quantitySold" | "unitPrice" | "cost" | "margin" | "costPct" | "popularity" | "classification";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: (ivaMode: IvaMode) => string }[] = [
  { key: "name", label: () => "Platillo" },
  { key: "quantitySold", label: () => "Cantidad vendida" },
  { key: "unitPrice", label: (iva) => `Precio${iva === "sin" ? " (sin IVA)" : ""}` },
  { key: "cost", label: () => "Costo" },
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
      return row.cost;
    case "margin":
      // La columna muestra el margen del periodo, asi que ordenar por ella tiene que ordenar
      // por eso mismo y no por el unitario, que es un ranking distinto.
      return row.totalMargin;
    case "costPct":
      return row.costPct;
    case "popularity":
      return row.popularity;
    case "classification":
      return CLASSIFICATION_LABELS[row.classification];
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
  const [search, setSearch] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<"all" | MenuEngineeringClassification>("all");

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

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortedRows.filter((row) => {
      if (term && !row.recipeName.toLowerCase().includes(term)) return false;
      if (classificationFilter !== "all" && row.classification !== classificationFilter) return false;
      return true;
    });
  }, [sortedRows, search, classificationFilter]);

  // El total sigue al filtro: preguntar "cuanto me dejaron los perros" es justo para lo que
  // sirve el filtro, y un total que ignora lo filtrado no responde nada.
  const totals = useMemo(
    () =>
      visibleRows.reduce(
        (acc, row) => ({
          quantitySold: acc.quantitySold + row.quantitySold,
          totalMargin: acc.totalMargin + row.totalMargin,
        }),
        { quantitySold: 0, totalMargin: 0 },
      ),
    [visibleRows],
  );

  const hasFilters = !!search.trim() || classificationFilter !== "all";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar platillo..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value as "all" | MenuEngineeringClassification)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todas las clasificaciones</option>
          {CLASSIFICATION_ORDER.map((c) => (
            <option key={c} value={c}>
              {CLASSIFICATION_ICONS[c]} {CLASSIFICATION_LABELS[c]}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setClassificationFilter("all");
            }}
            className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Limpiar
          </button>
        )}
        <p className="text-sm text-neutral-500">
          {visibleRows.length} de {rows.length} platillos
        </p>
      </div>

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
            {rows.length > 0 && visibleRows.length === 0 && (
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
                    <span
                      title="Este platillo tiene costo $0 o no confiable; probablemente falte capturar compras del insumo."
                      className="ml-2 text-amber-500"
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{row.quantitySold}</td>
                <td className="px-4 py-3">{formatMoney(row.unitPrice)}</td>
                <td className="px-4 py-3">{formatMoney(row.cost)}</td>
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
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[row.classification]}`}>
                    {CLASSIFICATION_ICONS[row.classification]} {CLASSIFICATION_LABELS[row.classification]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
              <tr>
                <td className="px-4 py-3">Total del periodo{hasFilters ? " (filtrado)" : ""}</td>
                <td className="px-4 py-3">{totals.quantitySold}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3">{formatMoney(totals.totalMargin)}</td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
