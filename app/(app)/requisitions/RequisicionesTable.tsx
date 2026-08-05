"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

export type RequisicionRow = {
  id: string;
  folioLabel: string;
  dateLabel: string;
  dateValue: number;
  fromSucursalName: string;
  toSucursalName: string;
  direction: "enviada" | "recibida";
  itemCount: number;
  total: number;
  note: string | null;
};

const DIRECTION_STYLE: Record<RequisicionRow["direction"], string> = {
  enviada: "bg-amber-100 text-amber-700",
  recibida: "bg-emerald-100 text-emerald-700",
};

const DIRECTION_LABEL: Record<RequisicionRow["direction"], string> = {
  enviada: "Enviada",
  recibida: "Recibida",
};

export default function RequisicionesTable({ rows }: { rows: RequisicionRow[] }) {
  const [folioSearch, setFolioSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | RequisicionRow["direction"]>("all");

  const filteredRows = useMemo(() => {
    const q = folioSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.folioLabel.toLowerCase().includes(q)) return false;
      if (directionFilter !== "all" && row.direction !== directionFilter) return false;
      return true;
    });
  }, [rows, folioSearch, directionFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={folioSearch}
          onChange={(e) => setFolioSearch(e.target.value)}
          placeholder="Buscar folio..."
          className="w-full max-w-[10rem] rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">Enviadas y recibidas</option>
          <option value="enviada">Solo enviadas</option>
          <option value="recibida">Solo recibidas</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Origen</th>
              <th className="px-4 py-2 font-medium">Destino</th>
              <th className="px-4 py-2 font-medium">Direccion</th>
              <th className="px-4 py-2 font-medium">Productos</th>
              <th className="px-4 py-2 font-medium">Costo total</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "Todavia no hay requisiciones registradas."
                    : "Ninguna requisicion coincide con los filtros."}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/requisitions/${row.id}`} className="text-neutral-700 hover:underline">
                    {row.folioLabel}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">{row.dateLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{row.fromSucursalName}</td>
                <td className="px-4 py-2 text-neutral-500">{row.toSucursalName}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${DIRECTION_STYLE[row.direction]}`}
                  >
                    {DIRECTION_LABEL[row.direction]}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-500">{row.itemCount}</td>
                <td className="px-4 py-2">{formatMoney(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
