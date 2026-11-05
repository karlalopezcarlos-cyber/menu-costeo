"use client";

import { useMemo, useState } from "react";
import MenuEngineeringTable from "./MenuEngineeringTable";
import MenuEngineeringMatrix from "./MenuEngineeringMatrix";
import {
  CLASSIFICATION_ICONS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_ORDER,
  SIN_CATEGORIA,
  SIN_CLASIFICAR,
  filterMenuRows,
  hasAnyMenuFilter,
  type IvaMode,
  type MenuEngineeringClassification,
  type MenuEngineeringRowView,
} from "@/lib/menu-engineering-view";

type Tab = "tabla" | "matriz";

const TAB_LABELS: Record<Tab, string> = { tabla: "Tabla", matriz: "Matriz" };

export default function MenuEngineeringView({
  rows,
  ivaMode,
  averageMargin,
  popularityThreshold,
}: {
  rows: MenuEngineeringRowView[];
  ivaMode: IvaMode;
  averageMargin: number;
  popularityThreshold: number;
}) {
  const [tab, setTab] = useState<Tab>("tabla");
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState<
    "all" | MenuEngineeringClassification | typeof SIN_CLASIFICAR
  >("all");
  const [category, setCategory] = useState("all");

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasSinCategoria = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasSinCategoria = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasSinCategoria };
  }, [rows]);

  const filters = useMemo(
    () => ({ search, classification, category }),
    [search, classification, category],
  );
  const visibleRows = useMemo(() => filterMenuRows(rows, filters), [rows, filters]);
  const hasFilters = hasAnyMenuFilter(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-neutral-200 bg-white p-0.5">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-neutral-900 text-white" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar platillo..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          {categoryOptions.names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {categoryOptions.hasSinCategoria && <option value={SIN_CATEGORIA}>Sin categoria</option>}
        </select>

        <select
          value={classification}
          onChange={(e) =>
            setClassification(e.target.value as "all" | MenuEngineeringClassification | typeof SIN_CLASIFICAR)
          }
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todas las clasificaciones</option>
          {CLASSIFICATION_ORDER.map((c) => (
            <option key={c} value={c}>
              {CLASSIFICATION_ICONS[c]} {CLASSIFICATION_LABELS[c]}
            </option>
          ))}
          <option value={SIN_CLASIFICAR}>⚠ Sin clasificar (revisar receta)</option>
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setClassification("all");
              setCategory("all");
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

      {hasFilters && (
        <p className="text-xs text-neutral-400">
          El filtro cambia lo que se muestra y lo que suma el total, no las clasificaciones: un
          platillo se compara siempre contra el menu completo, no contra lo que quede en pantalla.
        </p>
      )}

      {tab === "tabla" ? (
        <MenuEngineeringTable rows={visibleRows} ivaMode={ivaMode} />
      ) : (
        <MenuEngineeringMatrix
          rows={visibleRows}
          ivaMode={ivaMode}
          averageMargin={averageMargin}
          popularityThreshold={popularityThreshold}
        />
      )}
    </div>
  );
}
