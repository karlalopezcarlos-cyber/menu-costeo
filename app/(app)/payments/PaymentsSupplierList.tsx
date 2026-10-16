"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SupplierDailyMovement } from "@/lib/payments";

export type SupplierBalanceRow = {
  id: string;
  name: string;
  totalPurchased: number;
  totalPaid: number;
  balance: number;
  /** Dias de credito pactados con el proveedor. Null = no configurado. */
  creditDays: number | null;
  /** Folios ya vencidos que siguen debiendose. */
  overdueCount: number;
  /** Dias para el vencimiento mas proximo de los folios pendientes. */
  nextDueDays: number | null;
};

function money(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentsSupplierList({
  rows,
  movements,
  defaultFrom,
  defaultTo,
}: {
  rows: SupplierBalanceRow[];
  movements: SupplierDailyMovement[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [search, setSearch] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);
  // Por omision, el mes en curso.
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  const hayPeriodo = Boolean(dateFrom || dateTo);

  /** Comprado y pagado de cada proveedor dentro del periodo elegido. */
  const periodoPorProveedor = useMemo(() => {
    const mapa = new Map<string, { purchased: number; paid: number }>();
    for (const m of movements) {
      if (dateFrom && m.day < dateFrom) continue;
      if (dateTo && m.day > dateTo) continue;
      const actual = mapa.get(m.supplierId) ?? { purchased: 0, paid: 0 };
      actual.purchased += m.purchased;
      actual.paid += m.paid;
      mapa.set(m.supplierId, actual);
    }
    return mapa;
  }, [movements, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r) => {
        const periodo = periodoPorProveedor.get(r.id) ?? { purchased: 0, paid: 0 };
        return {
          ...r,
          periodPurchased: periodo.purchased,
          periodPaid: periodo.paid,
          periodBalance: periodo.purchased - periodo.paid,
        };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      // El filtro de saldo pendiente mira la deuda real, no la del periodo: un proveedor al que
      // le debes de meses pasados no debe desaparecer por elegir este mes.
      .filter((r) => !onlyWithBalance || r.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);
  }, [rows, search, onlyWithBalance, periodoPorProveedor]);

  const totalesPeriodo = useMemo(
    () => ({
      comprado: filtered.reduce((sum, r) => sum + r.periodPurchased, 0),
      pagado: filtered.reduce((sum, r) => sum + r.periodPaid, 0),
      saldoTotal: filtered.reduce((sum, r) => sum + r.balance, 0),
    }),
    [filtered],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar proveedor..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={onlyWithBalance}
            onChange={(e) => setOnlyWithBalance(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Solo con saldo pendiente
        </label>
        <div className="flex items-center gap-2 text-sm text-neutral-700">
          <label htmlFor="from" className="text-neutral-500">
            Desde
          </label>
          <input
            id="from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          />
          <label htmlFor="to" className="text-neutral-500">
            Hasta
          </label>
          <input
            id="to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
          />
          {hayPeriodo && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
            >
              Todo el historial
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Proveedor</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-right">
                {hayPeriodo ? "Comprado en el periodo" : "Total comprado"}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-right">
                {hayPeriodo ? "Pagado en el periodo" : "Total pagado"}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-right">
                Saldo total
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Credito</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0 ? "Todavia no hay proveedores." : "Ningun proveedor coincide con los filtros."}
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/payments/${row.id}`} className="text-neutral-900 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {money(hayPeriodo ? row.periodPurchased : row.totalPurchased)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {money(hayPeriodo ? row.periodPaid : row.totalPaid)}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${row.balance > 0.005 ? "text-red-600" : "text-green-700"}`}>
                  {money(row.balance)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {row.creditDays === null ? (
                    <span className="text-neutral-400">Sin credito</span>
                  ) : (
                    <>
                      <span className="text-neutral-600">{row.creditDays} dias</span>
                      {row.overdueCount > 0 ? (
                        <span className="mt-0.5 block text-xs font-medium text-red-600">
                          {row.overdueCount === 1 ? "1 folio vencido" : `${row.overdueCount} folios vencidos`}
                        </span>
                      ) : row.nextDueDays !== null ? (
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {row.nextDueDays === 0
                            ? "vence hoy"
                            : row.nextDueDays === 1
                              ? "vence en 1 dia"
                              : `vence en ${row.nextDueDays} dias`}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-medium text-neutral-900">
              <tr>
                <td className="px-4 py-3 text-xs uppercase tracking-[0.08em] text-neutral-500">
                  {hayPeriodo ? "Suma del periodo" : "Suma"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money(totalesPeriodo.comprado)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(totalesPeriodo.pagado)}</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    totalesPeriodo.saldoTotal > 0.005 ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {money(totalesPeriodo.saldoTotal)}
                </td>
                <td className="px-4 py-3"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
