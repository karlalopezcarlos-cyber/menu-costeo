"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SupplierBalanceRow = {
  id: string;
  name: string;
  totalPurchased: number;
  totalPaid: number;
  balance: number;
};

function money(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentsSupplierList({ rows }: { rows: SupplierBalanceRow[] }) {
  const [search, setSearch] = useState("");
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .filter((r) => !onlyWithBalance || r.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);
  }, [rows, search, onlyWithBalance]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar proveedor..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
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
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium text-right">Total comprado</th>
              <th className="px-4 py-2 font-medium text-right">Total pagado</th>
              <th className="px-4 py-2 font-medium text-right">Saldo</th>
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
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/payments/${row.id}`} className="text-neutral-900 hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right text-neutral-500">{money(row.totalPurchased)}</td>
                <td className="px-4 py-2 text-right text-neutral-500">{money(row.totalPaid)}</td>
                <td className={`px-4 py-2 text-right font-medium ${row.balance > 0.005 ? "text-red-600" : "text-green-700"}`}>
                  {money(row.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
