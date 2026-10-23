"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteDailySale } from "./actions";
import { formatMoney } from "@/lib/format";

export type SaleRow = {
  id: string;
  recipeId: string;
  dateLabel: string;
  dateValue: number;
  /** Fecha en formato yyyy-mm-dd, para precargar el input type=date al editar. */
  dateInputValue: string;
  recipeName: string;
  quantitySold: number;
  unitPrice: number;
  source: string;
  /** Ticket(s) de venta (mini POS) que aportaron a este renglon agregado del dia. */
  tickets: { id: string; folioLabel: string }[];
  /** false cuando el platillo no tiene ingredientes: su costo sale en cero. */
  hasRecipe: boolean;
  /** Quien dejo la venta como esta: la capturo, subio el archivo o cerro el ticket. */
  capturedBy: string | null;
  /** Cuantas veces se ha corregido a mano despues de registrada. */
  edits: number;
  lastEditLabel: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  import: "Importado",
  pos: "Ticket POS",
  manual: "Manual",
};

type SortKey = "date" | "recipe" | "quantity" | "price" | "total" | "source" | "captured";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "recipe", label: "Platillo" },
  { key: "quantity", label: "Cantidad" },
  { key: "price", label: "Precio" },
  { key: "total", label: "Total" },
  { key: "source", label: "Origen" },
  { key: "captured", label: "Capturo" },
];

function sortValue(row: SaleRow, key: SortKey): string | number {
  switch (key) {
    case "date":
      return row.dateValue;
    case "recipe":
      return row.recipeName.toLowerCase();
    case "quantity":
      return row.quantitySold;
    case "price":
      return row.unitPrice;
    case "total":
      return row.quantitySold * row.unitPrice;
    case "source":
      return row.source;
    case "captured":
      return (row.capturedBy ?? "").toLowerCase();
  }
}

export default function SalesTable({
  rows,
  onEdit,
}: {
  rows: SaleRow[];
  onEdit: (row: SaleRow) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // El buscador filtra por platillo y por quien capturo, que es como se busca de verdad: "todo
  // lo que subio Gera" o "todo lo del affogato".
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.recipeName.toLowerCase().includes(q) ||
        (row.capturedBy ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totales = useMemo(
    () => ({
      renglones: filteredRows.length,
      unidades: filteredRows.reduce((sum, r) => sum + r.quantitySold, 0),
      importe: filteredRows.reduce((sum, r) => sum + r.quantitySold * r.unitPrice, 0),
    }),
    [filteredRows],
  );

  const sortedRows = useMemo(() => {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dirMultiplier;
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
  }, [filteredRows, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar platillo o quien capturo..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtro
          </button>
        )}
        <div className="ml-auto flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs font-medium text-neutral-500">Venta</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900">
              {formatMoney(totales.importe)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-neutral-500">Unidades</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900">
              {totales.unidades.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-neutral-500">Renglones</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900">{totales.renglones}</p>
          </div>
        </div>
      </div>

    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
          <tr>
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
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                {search
                  ? "Ninguna venta coincide con la busqueda."
                  : "No hay ventas capturadas en este periodo."}
              </td>
            </tr>
          )}
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
              <td className="px-4 py-3 text-neutral-500">{row.dateLabel}</td>
              <td className="px-4 py-3">
                {row.recipeName}
                {!row.hasRecipe && (
                  <Link
                    href={`/recipes/${row.recipeId}`}
                    className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                    title="Este platillo no tiene ingredientes: su costo sale en cero"
                  >
                    sin receta
                  </Link>
                )}
              </td>
              <td className="px-4 py-3">{row.quantitySold}</td>
              <td className="px-4 py-3">{formatMoney(row.unitPrice)}</td>
              <td className="px-4 py-3">{formatMoney(row.quantitySold * row.unitPrice)}</td>
              <td className="px-4 py-3 text-neutral-400">
                <div>{SOURCE_LABELS[row.source] ?? row.source}</div>
                {row.tickets.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {row.tickets.map((t) => (
                      <Link
                        key={t.id}
                        href={`/sales/tickets/${t.id}`}
                        className="text-xs text-neutral-500 hover:underline"
                      >
                        {t.folioLabel}
                      </Link>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-500">
                {row.capturedBy ?? <span className="text-neutral-300">—</span>}
                {row.edits > 0 && (
                  <p
                    className="mt-0.5 text-xs text-amber-600"
                    title={row.lastEditLabel ? `Ultima correccion: ${row.lastEditLabel}` : undefined}
                  >
                    Editada {row.edits} {row.edits === 1 ? "vez" : "veces"}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="text-neutral-400 hover:text-neutral-900"
                  >
                    Editar
                  </button>
                  {/* Borrar un renglon suelto solo es honesto cuando la venta se capturo a
                      mano: una venta importada esta respaldada por el renglon del archivo, y
                      borrarla aqui la haria reaparecer en el siguiente recalculo. Esas se
                      borran por dia completo, que es como entraron. */}
                  {row.source === "manual" ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("¿Eliminar esta venta? Esta accion no se puede deshacer.")) {
                          deleteDailySale(row.id);
                        }
                      }}
                      className="text-neutral-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

      <p className="text-xs text-neutral-500">
        Las ventas que entraron por archivo o por ticket se borran por <b>dia completo</b>, en la
        pestana Ventas por dia: borrarlas de una en una las dejaria volver en el siguiente
        recalculo, porque el renglon del archivo sigue ahi. Las capturadas a mano si se borran
        por renglon.
      </p>
    </div>
  );
}
