import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import ExpensesTable, { type ExpenseRow } from "./ExpensesTable";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSucursalContext();

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const from = params.from ? new Date(`${params.from}T00:00:00Z`) : defaultFrom;
  const to = params.to ? new Date(`${params.to}T00:00:00Z`) : defaultTo;

  const expenses = await prisma.expense.findMany({
    where: { sucursalId: user.sucursalId, date: { gte: from, lte: to } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  const rows: ExpenseRow[] = expenses.map((expense) => ({
    id: expense.id,
    dateLabel: expense.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: expense.date.getTime(),
    categoryName: expense.category?.name ?? null,
    concept: expense.concept,
    supplierName: expense.supplier?.name ?? null,
    invoiceFolio: expense.invoiceFolio,
    amount: Number(expense.amount),
    capturedBy: expense.createdBy?.name ?? expense.createdBy?.email ?? null,
    comment: expense.comment,
  }));

  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Compras</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Gastos</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Lo que se paga para operar y no pasa por el almacen: renta, luz, nomina,
            mantenimiento, publicidad. No son productos, no se inventarian y no entran al costo
            de ventas; salen en su propio renglon del Estado de Resultados.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/expense-categories"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Tipos de gasto
          </Link>
          <Link
            href="/expenses/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Registrar gasto
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="from" className="text-sm font-medium text-neutral-700">
            Desde
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={toDateInputValue(from)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-sm font-medium text-neutral-700">
            Hasta
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={toDateInputValue(to)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Ver
        </button>
        <div className="ml-auto text-right">
          <p className="text-xs font-medium text-neutral-500">Total del periodo</p>
          <p className="text-2xl font-semibold tracking-tight text-neutral-900">
            {formatMoney(total)}
          </p>
        </div>
      </form>

      <ExpensesTable rows={rows} />
    </div>
  );
}
