"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createPurchaseOrdersBySupplier } from "../actions";
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
  /** Proveedor habitual del catalogo: con el se arma el desglose por omision. */
  defaultSupplierId: string | null;
};

type SortKey = "supplier" | "category" | "name" | "current" | "target" | "shortfall";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "supplier", label: "Proveedor" },
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
  const [state, formAction, pending] = useActionState(createPurchaseOrdersBySupplier, initialState);
  const [sortKey, setSortKey] = useState<SortKey>("supplier");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.shortfall ? String(r.shortfall) : ""])),
  );
  const [presentationLabels, setPresentationLabels] = useState<Record<string, string>>({});
  // El proveedor de cada linea arranca en el habitual del producto y se puede cambiar solo para
  // este pedido, sin tocar el catalogo.
  const [supplierByRow, setSupplierByRow] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.defaultSupplierId ?? ""])),
  );

  const supplierNameById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

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

  function supplierNameOf(row: ShortfallRow): string | null {
    const id = supplierByRow[row.id] ?? "";
    return id ? (supplierNameById.get(id) ?? null) : null;
  }

  function sortValue(row: ShortfallRow, key: SortKey): string | number | null {
    switch (key) {
      case "supplier": {
        const name = supplierNameOf(row);
        return name ? name.toLowerCase() : null;
      }
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
      // Los que no tienen valor (sin proveedor, sin categoria) siempre al final.
      if (va === null && vb === null) return a.name.localeCompare(b.name);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb) * dirMultiplier;
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, supplierByRow]);

  const visibleRows = useMemo(
    () => sortedRows.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedRows, search, categoryFilter],
  );

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

  const selectedRows = useMemo(() => rows.filter((r) => selected[r.id]), [rows, selected]);
  const selectedCount = selectedRows.length;

  /** El desglose tal como va a quedar: un pedido por proveedor. */
  const grupos = useMemo(() => {
    const porProveedor = new Map<string, { nombre: string; productos: number }>();
    for (const row of selectedRows) {
      const id = supplierByRow[row.id] ?? "";
      const nombre = id ? (supplierNameById.get(id) ?? "Proveedor") : "Sin proveedor asignado";
      const actual = porProveedor.get(id);
      if (actual) actual.productos += 1;
      else porProveedor.set(id, { nombre, productos: 1 });
    }
    return [...porProveedor.entries()]
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => {
        if (!a.id) return 1;
        if (!b.id) return -1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [selectedRows, supplierByRow, supplierNameById]);

  const sinProveedorSeleccionados = grupos.find((g) => !g.id)?.productos ?? 0;

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        selectedRows.map((row) => ({
          productId: row.id,
          quantity: quantities[row.id] ?? "",
          presentationLabel: presentationLabels[row.id] ?? row.defaultPresentation,
          supplierId: supplierByRow[row.id] ?? "",
        })),
      ),
    [selectedRows, quantities, presentationLabels, supplierByRow],
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-neutral-700">Como se va a desglosar</p>
          {grupos.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Selecciona productos y aqui te muestro en cuantos pedidos se parte, uno por
              proveedor. Cada producto trae el proveedor con el que lo pides normalmente; lo puedes
              cambiar solo para este pedido en su renglon.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 pt-1">
              {grupos.map((grupo) => (
                <li
                  key={grupo.id || "sin-proveedor"}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    grupo.id
                      ? "bg-neutral-100 text-neutral-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {grupo.nombre}: {grupo.productos} producto{grupo.productos === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          )}
          {sinProveedorSeleccionados > 0 && (
            <p className="pt-1 text-xs text-amber-700">
              {sinProveedorSeleccionados} producto{sinProveedorSeleccionados === 1 ? "" : "s"} sin
              proveedor: van a quedar juntos en un pedido aparte. Si quieres dejarlo amarrado para
              siempre,{" "}
              <Link href="/products/suppliers" className="font-medium underline">
                asignale su proveedor habitual
              </Link>
              .
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
            Comentarios (opcional, van en todos los pedidos)
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={1}
            placeholder="Ej. entregar antes de las 10 am"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
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

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"></th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
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
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Cantidad a pedir</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  No hay faltantes: todos los productos con stock objetivo estan en su nivel o por
                  encima.
                </td>
              </tr>
            )}
            {sortedRows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const visible = matchesFilter(row);
              const isSelected = !!selected[row.id];
              const supplierId = supplierByRow[row.id] ?? "";
              const cambiado = supplierId !== (row.defaultSupplierId ?? "");
              return (
                <tr
                  key={row.id}
                  className={
                    !visible
                      ? "hidden"
                      : `border-t border-neutral-100 ${row.alreadyInOpenOrder ? "bg-amber-50" : "bg-white"}`
                  }
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [row.id]: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={supplierId}
                      onChange={(e) =>
                        setSupplierByRow((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className={`w-44 rounded-md border px-2 py-1 text-sm ${
                        cambiado
                          ? "border-brand-300 bg-brand-50"
                          : supplierId
                            ? "border-neutral-200"
                            : "border-amber-300 bg-amber-50"
                      }`}
                    >
                      <option value="">Sin proveedor</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.name}
                    {row.alreadyInOpenOrder && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        Ya en pedido
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {row.currentStock} {row.unitLabel}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {row.targetStock} {row.unitLabel}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {row.shortfall} {row.unitLabel}
                  </td>
                  <td className="px-4 py-3">
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
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending
            ? grupos.length > 1
              ? "Creando pedidos..."
              : "Creando pedido..."
            : selectedCount === 0
              ? "Selecciona productos para crear un pedido"
              : grupos.length > 1
                ? `Crear ${grupos.length} pedidos (${selectedCount} productos)`
                : `Crear pedido con ${selectedCount} producto${selectedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
