"use client";

import { useMemo, useState } from "react";
import { saveDefaultSuppliers } from "./actions";

export type ProductSupplierRow = {
  id: string;
  name: string;
  categoryName: string | null;
  defaultSupplierId: string | null;
};

type SupplierOption = { id: string; name: string };

export default function ProductSupplierTable({
  rows,
  suppliers,
  sinProveedor,
}: {
  rows: ProductSupplierRow[];
  suppliers: SupplierOption[];
  sinProveedor: number;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [bulkSupplier, setBulkSupplier] = useState("");
  const [asignados, setAsignados] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.defaultSupplierId ?? ""])),
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

  function matchesFilter(row: ProductSupplierRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (categoryFilter === "none" && row.categoryName !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
      return false;
    }
    const actual = asignados[row.id] ?? "";
    if (supplierFilter === "none" && actual !== "") return false;
    if (supplierFilter !== "all" && supplierFilter !== "none" && actual !== supplierFilter) return false;
    return true;
  }

  const visibleRows = useMemo(
    () => rows.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, search, categoryFilter, supplierFilter, asignados],
  );

  const pendientes = rows.filter((r) => !(asignados[r.id] ?? "")).length;
  const cambios = rows.filter((r) => (asignados[r.id] ?? "") !== (r.defaultSupplierId ?? "")).length;

  /** Asigna de golpe lo que esta en pantalla: filtras una categoria y la mandas completa. */
  function aplicarAVisibles() {
    setAsignados((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) next[row.id] = bulkSupplier;
      return next;
    });
  }

  return (
    <form action={saveDefaultSuppliers} className="space-y-3">
      {/* Todas las filas van en el form, tambien las que el filtro esconde: asi un guardado no
          pierde lo que asignaste antes de filtrar. */}
      {rows.map((row) => (
        <input key={row.id} type="hidden" name={`supplier:${row.id}`} value={asignados[row.id] ?? ""} />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
        <p className="text-sm text-neutral-500">
          {pendientes === 0
            ? `Todos los productos tienen proveedor habitual (${rows.length}).`
            : `${pendientes} de ${rows.length} productos todavia sin proveedor habitual.`}
          {cambios > 0 && (
            <span className="ml-1 font-medium text-amber-700">
              {cambios} cambio{cambios === 1 ? "" : "s"} sin guardar.
            </span>
          )}
        </p>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Guardar
        </button>
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
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todos los proveedores</option>
          <option value="none">Sin proveedor habitual{sinProveedor ? ` (${sinProveedor})` : ""}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {(search || categoryFilter !== "all" || supplierFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
              setSupplierFilter("all");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm text-neutral-600">Asignar a los {visibleRows.length} productos en pantalla:</span>
        <select
          value={bulkSupplier}
          onChange={(e) => setBulkSupplier(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Sin proveedor habitual</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={aplicarAVisibles}
          disabled={visibleRows.length === 0}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 disabled:opacity-50"
        >
          Aplicar
        </button>
        <span className="text-xs text-neutral-500">
          Filtra una categoria y mandala completa con un proveedor; luego ajusta las excepciones.
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Categoria</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Producto</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Proveedor habitual</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay productos que se compren.
                </td>
              </tr>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const visible = matchesFilter(row);
              const cambiado = (asignados[row.id] ?? "") !== (row.defaultSupplierId ?? "");
              return (
                <tr key={row.id} className={visible ? "border-t border-neutral-100" : "hidden"}>
                  <td className="px-4 py-3 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={asignados[row.id] ?? ""}
                      onChange={(e) =>
                        setAsignados((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className={`w-full max-w-xs rounded-md border px-2 py-1 text-sm ${
                        cambiado ? "border-amber-300 bg-amber-50" : "border-neutral-200"
                      }`}
                    >
                      <option value="">Sin proveedor habitual</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
