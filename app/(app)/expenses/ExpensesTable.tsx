"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { deleteExpense } from "./actions";

export type ExpenseRow = {
  id: string;
  dateLabel: string;
  dateValue: number;
  categoryName: string | null;
  concept: string;
  supplierName: string | null;
  invoiceFolio: string | null;
  amount: number;
  capturedBy: string | null;
  comment: string | null;
};

export default function ExpensesTable({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categorias = useMemo(
    () => [...new Set(rows.map((r) => r.categoryName).filter((n): n is string => !!n))].sort(),
    [rows],
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        q &&
        !row.concept.toLowerCase().includes(q) &&
        !(row.supplierName ?? "").toLowerCase().includes(q) &&
        !(row.invoiceFolio ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (categoryFilter === "none" && row.categoryName !== null) return false;
      if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter]);

  // El total sigue a los filtros: filtrar "Renta" y ver cuanto se va en renta es justo para lo
  // que sirve esta pantalla.
  const total = visibles.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar concepto, proveedor o folio..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="all">Todos los tipos</option>
          {categorias.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="none">Sin tipo</option>
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
        <div className="ml-auto text-right">
          <p className="text-xs font-medium text-neutral-500">Filtrado</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-900">{formatMoney(total)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Fecha</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Tipo</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Concepto</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Proveedor</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Factura</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Monto</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Capturo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-400">
                  No hay gastos en este periodo.
                </td>
              </tr>
            )}
            {rows.length > 0 && visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Ningun gasto coincide con los filtros.
                </td>
              </tr>
            )}
            {visibles.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 align-top transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3 text-neutral-500">{row.dateLabel}</td>
                <td className="px-4 py-3 text-neutral-600">{row.categoryName ?? "—"}</td>
                <td className="px-4 py-3">
                  <p className="text-neutral-900">{row.concept}</p>
                  {row.comment && <p className="text-xs text-neutral-500">{row.comment}</p>}
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.supplierName ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{row.invoiceFolio ?? "—"}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">
                  {formatMoney(row.amount)}
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.capturedBy ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`¿Eliminar el gasto "${row.concept}" por ${formatMoney(row.amount)}?`)) {
                        return;
                      }
                      startTransition(async () => {
                        await deleteExpense(row.id);
                        router.refresh();
                      });
                    }}
                    className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
