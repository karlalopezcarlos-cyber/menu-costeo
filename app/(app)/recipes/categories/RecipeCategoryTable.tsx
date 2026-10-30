"use client";

import { useMemo, useState } from "react";
import { saveRecipeCategories } from "./actions";

export type RecipeCategoryRow = {
  id: string;
  name: string;
  categoryId: string | null;
  isMenuItem: boolean;
};

export default function RecipeCategoryTable({
  rows,
  categories,
}: {
  rows: RecipeCategoryRow[];
  categories: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [bulkCategoria, setBulkCategoria] = useState("");
  const [categoriaDe, setCategoriaDe] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.categoryId ?? ""])),
  );

  function matchesFilter(row: RecipeCategoryRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (typeFilter === "plu" && !row.isMenuItem) return false;
    if (typeFilter === "subrecipe" && row.isMenuItem) return false;
    // El filtro sigue lo que llevas cambiado en pantalla, no lo guardado: si no, una receta
    // desapareceria de la lista justo despues de moverla.
    const categoriaActual = categoriaDe[row.id] ?? "";
    if (categoryFilter === "none" && categoriaActual !== "") return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && categoriaActual !== categoryFilter) {
      return false;
    }
    return true;
  }

  const visibleRows = useMemo(
    () => rows.filter(matchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, search, categoryFilter, typeFilter, categoriaDe],
  );

  const sinCategoria = rows.filter((r) => !(categoriaDe[r.id] ?? "")).length;
  const cambios = rows.filter((r) => (categoriaDe[r.id] ?? "") !== (r.categoryId ?? "")).length;

  /** Cambia de golpe lo que esta en pantalla: filtras "ROLLOS" y lo mandas completo. */
  function aplicarAVisibles() {
    setCategoriaDe((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) next[row.id] = bulkCategoria;
      return next;
    });
  }

  return (
    <form action={saveRecipeCategories} className="space-y-3">
      {/* Todas las filas van en el form, tambien las que el filtro esconde: asi un guardado no
          pierde lo que acomodaste antes de filtrar. */}
      {rows.map((row) => (
        <input
          key={row.id}
          type="hidden"
          name={`category:${row.id}`}
          value={categoriaDe[row.id] ?? ""}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
        <p className="text-sm text-neutral-500">
          {sinCategoria === 0
            ? `Todas las recetas tienen categoria (${rows.length}).`
            : `${sinCategoria} de ${rows.length} recetas todavia sin categoria.`}
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
          placeholder="Buscar receta..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todos los tipos</option>
          <option value="plu">Solo PLU (platillos de menu)</option>
          <option value="subrecipe">Solo subrecetas</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          <option value="none">Sin categoria{sinCategoria ? ` (${sinCategoria})` : ""}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {(search || categoryFilter !== "all" || typeFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
              setTypeFilter("all");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="text-sm text-neutral-600">
          Cambiar la categoria de las {visibleRows.length} recetas en pantalla:
        </span>
        <select
          value={bulkCategoria}
          onChange={(e) => setBulkCategoria(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Sin categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
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
          Filtra lo que quieras y mandalo completo; luego ajusta las excepciones.
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Receta</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Tipo</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Categoria</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay recetas.
                </td>
              </tr>
            )}
            {rows.length > 0 && visibleRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Ninguna receta coincide con los filtros.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const visible = matchesFilter(row);
              const cambiado = (categoriaDe[row.id] ?? "") !== (row.categoryId ?? "");
              return (
                <tr key={row.id} className={visible ? "border-t border-neutral-100" : "hidden"}>
                  <td className="px-4 py-3">{row.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        row.isMenuItem
                          ? "bg-blue-50 text-blue-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {row.isMenuItem ? "PLU" : "Subreceta"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={categoriaDe[row.id] ?? ""}
                      onChange={(e) =>
                        setCategoriaDe((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className={`w-full max-w-xs rounded-md border px-2 py-1 text-sm ${
                        cambiado ? "border-amber-300 bg-amber-50" : "border-neutral-200"
                      }`}
                    >
                      <option value="">Sin categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
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
