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
};

const SOURCE_LABELS: Record<string, string> = {
  import: "Importado",
  pos: "Ticket POS",
  manual: "Manual",
};

type SortKey = "date" | "recipe" | "quantity" | "price" | "total" | "source";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Fecha" },
  { key: "recipe", label: "Platillo" },
  { key: "quantity", label: "Cantidad" },
  { key: "price", label: "Precio" },
  { key: "total", label: "Total" },
  { key: "source", label: "Origen" },
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
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dirMultiplier;
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
  }, [rows, sortKey, sortDir]);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
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
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                No hay ventas capturadas en este periodo.
              </td>
            </tr>
          )}
          {sortedRows.map((row) => (
            <tr key={row.id} className="border-t border-neutral-100">
              <td className="px-4 py-2 text-neutral-500">{row.dateLabel}</td>
              <td className="px-4 py-2">{row.recipeName}</td>
              <td className="px-4 py-2">{row.quantitySold}</td>
              <td className="px-4 py-2">{formatMoney(row.unitPrice)}</td>
              <td className="px-4 py-2">{formatMoney(row.quantitySold * row.unitPrice)}</td>
              <td className="px-4 py-2 text-neutral-400">
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
              <td className="px-4 py-2 text-right">
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="text-neutral-400 hover:text-neutral-900"
                  >
                    Editar
                  </button>
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
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
