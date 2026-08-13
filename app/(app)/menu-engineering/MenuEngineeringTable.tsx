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
  { key: "margin", label: () => "Margen" },
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
      return row.margin;
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

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-neutral-900 text-left text-white">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-4 py-2 font-medium">
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
          {sortedRows.map((row) => (
            <tr key={row.recipeId} className="border-t border-neutral-100">
              <td className="px-4 py-2">
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
              <td className="px-4 py-2">{row.quantitySold}</td>
              <td className="px-4 py-2">{formatMoney(row.unitPrice)}</td>
              <td className="px-4 py-2">{formatMoney(row.cost)}</td>
              <td className="px-4 py-2">{formatMoney(row.margin)}</td>
              <td className="px-4 py-2">
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
              <td className="px-4 py-2">{(row.popularity * 100).toFixed(1)}%</td>
              <td className="px-4 py-2">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[row.classification]}`}>
                  {CLASSIFICATION_ICONS[row.classification]} {CLASSIFICATION_LABELS[row.classification]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
