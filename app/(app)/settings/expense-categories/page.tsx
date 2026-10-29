import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import SettingsNav from "../SettingsNav";
import InlineNameEditor from "../InlineNameEditor";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  renameExpenseCategory,
} from "./actions";

export default async function ExpenseCategoriesPage() {
  const user = await requireOrgSession();

  const categories = await prisma.expenseCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { expenses: true } }, expenses: { select: { amount: true } } },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/expense-categories" />
        <p className="mt-3 text-sm text-neutral-500">
          Como se clasifican los gastos de operacion: renta, servicios, nomina, mantenimiento.
          Son los que se usan al registrar un gasto, y con ellos se puede ver en que se va el
          dinero que no es insumo.
        </p>
      </div>

      <form action={createExpenseCategory} className="flex gap-2">
        <input
          name="name"
          required
          placeholder="Ej. Renta, Servicios, Nomina"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Agregar
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Tipo</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Gastos</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Acumulado
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Todavia no hay tipos de gasto.
                </td>
              </tr>
            )}
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-neutral-100">
                <td className="px-4 py-3">
                  <InlineNameEditor
                    id={category.id}
                    initialName={category.name}
                    action={renameExpenseCategory}
                  />
                </td>
                <td className="px-4 py-3 text-neutral-500">{category._count.expenses}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {formatMoney(category.expenses.reduce((sum, e) => sum + Number(e.amount), 0))}
                </td>
                <td className="px-4 py-3 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await deleteExpenseCategory(category.id);
                    }}
                  >
                    <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
                      Borrar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Borrar un tipo no borra sus gastos: quedan sin tipo y se siguen sumando al total.
      </p>
    </div>
  );
}
