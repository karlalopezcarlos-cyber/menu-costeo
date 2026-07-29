"use client";

import { useMemo, useState } from "react";

export type ChangeLogRow = {
  id: string;
  changedAtLabel: string;
  changedByName: string | null;
  itemName: string;
  unitLabel: string;
  previousQuantity: number | null;
  newQuantity: number;
};

function fmt(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

export default function InventoryChangeLogTable({ rows }: { rows: ChangeLogRow[] }) {
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.itemName.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto o subreceta..."
        className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha y hora</th>
              <th className="px-4 py-2 font-medium">Usuario</th>
              <th className="px-4 py-2 font-medium">Producto / Subreceta</th>
              <th className="px-4 py-2 font-medium">Antes</th>
              <th className="px-4 py-2 font-medium">Despues</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay cambios registrados en este conteo.
                </td>
              </tr>
            )}
            {rows.length > 0 && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Ningun cambio coincide con la busqueda.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const isFirstCapture = row.previousQuantity === null;
              const isDeletion = row.newQuantity === 0;
              return (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-500">{row.changedAtLabel}</td>
                  <td className="px-4 py-2 text-neutral-500">{row.changedByName ?? "-"}</td>
                  <td className="px-4 py-2">{row.itemName}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {isFirstCapture ? (
                      <span className="text-neutral-300">-</span>
                    ) : (
                      `${fmt(row.previousQuantity as number)} ${row.unitLabel}`
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 font-medium ${
                      isDeletion ? "text-red-600" : isFirstCapture ? "text-emerald-700" : "text-amber-600"
                    }`}
                  >
                    {isDeletion ? "Borrado" : `${fmt(row.newQuantity)} ${row.unitLabel}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
