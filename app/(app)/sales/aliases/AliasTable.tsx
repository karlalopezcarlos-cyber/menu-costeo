"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAliasRecipe, setAliasIgnored, deleteAlias } from "./actions";

export type AliasRow = {
  id: string;
  externalName: string;
  recipeId: string | null;
  recipeName: string | null;
  recipeArchived: boolean;
  ignored: boolean;
  /** Renglones ya importados con este nombre: lo que se moveria al corregir la vinculacion. */
  importedRows: number;
};

type Filtro = "todos" | "vinculados" | "sin-vincular" | "ignorados";

export default function AliasTable({
  rows,
  recipes,
}: {
  rows: AliasRow[];
  recipes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  function ejecutar(accion: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await accion();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
      }
    });
  }

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.externalName.toLowerCase().includes(q) && !(row.recipeName ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (filtro === "vinculados") return !!row.recipeId && !row.ignored;
      if (filtro === "sin-vincular") return !row.recipeId && !row.ignored;
      if (filtro === "ignorados") return row.ignored;
      return true;
    });
  }, [rows, search, filtro]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre o platillo..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="todos">Todas</option>
          <option value="vinculados">Vinculadas</option>
          <option value="sin-vincular">Sin vincular</option>
          <option value="ignorados">No son platillo</option>
        </select>
        <span className="text-sm text-neutral-500">
          {visibles.length} de {rows.length}
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Nombre en tu punto de venta
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Platillo</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Ventas importadas
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Todavia no hay vinculaciones. Se crean solas la primera vez que importas ventas
                  desde Excel.
                </td>
              </tr>
            )}
            {rows.length > 0 && visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Ninguna coincide con los filtros.
                </td>
              </tr>
            )}
            {visibles.map((row) => {
              const elegido = borrador[row.id] ?? row.recipeId ?? "";
              const cambio = elegido !== (row.recipeId ?? "") && elegido !== "";
              return (
                <tr key={row.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{row.externalName}</p>
                    {row.ignored && (
                      <span className="mt-0.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                        No es platillo
                      </span>
                    )}
                    {!row.ignored && !row.recipeId && (
                      <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        Sin vincular
                      </span>
                    )}
                    {row.recipeArchived && (
                      <span className="mt-0.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                        El platillo esta archivado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={elegido}
                      disabled={pending}
                      onChange={(e) => setBorrador((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      className={`w-full max-w-xs rounded-md border px-2 py-1.5 text-sm ${
                        cambio ? "border-brand-300 bg-brand-50" : "border-neutral-200"
                      }`}
                    >
                      <option value="">Sin platillo</option>
                      {recipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </option>
                      ))}
                    </select>
                    {cambio && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {row.importedRows > 0 && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              ejecutar(async () => {
                                await updateAliasRecipe(row.id, elegido, true);
                                setBorrador((prev) => {
                                  const next = { ...prev };
                                  delete next[row.id];
                                  return next;
                                });
                              })
                            }
                            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
                          >
                            Guardar y mover las {row.importedRows} ventas
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            ejecutar(async () => {
                              await updateAliasRecipe(row.id, elegido, false);
                              setBorrador((prev) => {
                                const next = { ...prev };
                                delete next[row.id];
                                return next;
                              });
                            })
                          }
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 disabled:opacity-50"
                        >
                          {row.importedRows > 0 ? "Solo de aqui en adelante" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setBorrador((prev) => {
                              const next = { ...prev };
                              delete next[row.id];
                              return next;
                            })
                          }
                          className="text-xs text-neutral-400 hover:text-neutral-600"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                    {row.importedRows > 0 ? row.importedRows : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => ejecutar(() => setAliasIgnored(row.id, !row.ignored))}
                        className="text-xs text-neutral-400 transition-colors hover:text-brand-600 disabled:opacity-50"
                      >
                        {row.ignored ? "Si es platillo" : "No es platillo"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !confirm(
                              `¿Quitar la vinculacion de "${row.externalName}"? Las ventas ya importadas se quedan como estan, y la proxima importacion te va a volver a preguntar que hacer con ese nombre.`,
                            )
                          ) {
                            return;
                          }
                          ejecutar(() => deleteAlias(row.id));
                        }}
                        className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        <b>Guardar y mover</b> reacomoda tambien las ventas que ya habias importado con ese
        nombre, reconstruyendolas desde los archivos originales. <b>Solo de aqui en adelante</b>
        {" "}deja lo ya importado como esta y aplica el cambio a las proximas importaciones.
      </p>
    </div>
  );
}
