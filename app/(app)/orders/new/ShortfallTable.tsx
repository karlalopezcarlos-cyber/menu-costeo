"use client";

import { useActionState, useMemo, useState } from "react";
import { createPurchaseOrder } from "../actions";
import PresentationQuantityInput, {
  type PresentationOption,
} from "../../_components/PresentationQuantityInput";
import type { UnitValue } from "@/lib/units";

export type ShortfallRow = {
  id: string;
  name: string;
  categoryName: string | null;
  baseUnit: UnitValue;
  unitLabel: string;
  currentStock: number;
  targetStock: number;
  shortfall: number;
  alreadyInOpenOrder: boolean;
  defaultPresentation: string;
  presentations: PresentationOption[];
};

type SortKey = "category" | "name" | "current" | "target" | "shortfall";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "category", label: "Categoria" },
  { key: "name", label: "Producto" },
  { key: "current", label: "Stock actual" },
  { key: "target", label: "Stock objetivo" },
  { key: "shortfall", label: "Falta" },
];

type SupplierOption = { id: string; name: string };

const initialState: { error?: string } = {};

export default function ShortfallTable({
  rows,
  suppliers,
}: {
  rows: ShortfallRow[];
  suppliers: SupplierOption[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseOrder, initialState);
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierId, setSupplierId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.shortfall ? String(r.shortfall) : ""])),
  );
  const [presentationLabels, setPresentationLabels] = useState<Record<string, string>>({});

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasUncategorized };
  }, [rows]);

  function matchesFilter(row: ShortfallRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (categoryFilter === "none" && row.categoryName !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
      return false;
    }
    return true;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortValue(row: ShortfallRow, key: SortKey): string | number | null {
    switch (key) {
      case "category":
        return row.categoryName ? row.categoryName.toLowerCase() : null;
      case "name":
        return row.name.toLowerCase();
      case "current":
        return row.currentStock;
      case "target":
        return row.targetStock;
      case "shortfall":
        return row.shortfall;
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

  const visibleRows = useMemo(() => sortedRows.filter(matchesFilter), [sortedRows, search, categoryFilter]);

  function selectAllVisible() {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) next[row.id] = true;
      return next;
    });
  }

  function clearSelection() {
    setSelected({});
  }

  const selectedCount = rows.filter((r) => selected[r.id]).length;

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((row) => selected[row.id])
          .map((row) => ({
            productId: row.id,
            quantity: quantities[row.id] ?? "",
            presentationLabel: presentationLabels[row.id] ?? row.defaultPresentation,
          })),
      ),
    [rows, selected, quantities, presentationLabels],
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-1">
          <label htmlFor="supplierId" className="text-sm font-medium text-neutral-700">
            Proveedor (opcional)
          </label>
          <select
            id="supplierId"
            name="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
            Comentarios (opcional)
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={1}
            placeholder="Ej. entregar antes de las 10 am"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
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
        <div className="ml-auto flex items-center gap-3">
          <button type="button" onClick={selectAllVisible} className="text-sm text-neutral-600 hover:underline">
            Seleccionar visibles
          </button>
          <button type="button" onClick={clearSelection} className="text-sm text-neutral-500 hover:underline">
            Quitar seleccion
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-100 ring-1 ring-amber-300" />
          Ya esta en un pedido abierto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-white ring-1 ring-neutral-300" />
          Todavia no se ha pedido
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium"></th>
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
              <th className="px-4 py-2 font-medium">Cantidad a pedir</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  No hay faltantes: todos los productos con stock objetivo estan en su nivel o por
                  encima.
                </td>
              </tr>
            )}
            {sortedRows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const visible = matchesFilter(row);
              const isSelected = !!selected[row.id];
              return (
                <tr
                  key={row.id}
                  className={
                    !visible
                      ? "hidden"
                      : `border-t border-neutral-100 ${row.alreadyInOpenOrder ? "bg-amber-50" : "bg-white"}`
                  }
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [row.id]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className="px-4 py-2">
                    {row.name}
                    {row.alreadyInOpenOrder && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        Ya en pedido
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {row.currentStock} {row.unitLabel}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {row.targetStock} {row.unitLabel}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {row.shortfall} {row.unitLabel}
                  </td>
                  <td className="px-4 py-2">
                    <PresentationQuantityInput
                      baseUnit={row.baseUnit}
                      unitLabel={row.unitLabel}
                      presentations={row.presentations}
                      value={quantities[row.id] ?? ""}
                      onChange={(qty) => setQuantities((prev) => ({ ...prev, [row.id]: qty }))}
                      onPresentationChange={(label) =>
                        setPresentationLabels((prev) => ({ ...prev, [row.id]: label ?? row.defaultPresentation }))
                      }
                      multiPresentation
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selectedCount === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending
            ? "Creando pedido..."
            : selectedCount > 0
              ? `Crear pedido con ${selectedCount} producto${selectedCount === 1 ? "" : "s"}`
              : "Selecciona productos para crear un pedido"}
        </button>
      </div>
    </form>
  );
}
