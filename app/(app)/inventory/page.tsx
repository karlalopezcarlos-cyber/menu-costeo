import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { createInventoryCount } from "./actions";
import { formatMoney } from "@/lib/format";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function InventoryPage() {
  const user = await requireOrgSession();

  const counts = await prisma.inventoryCount.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { date: "desc" },
    include: { items: true },
  });

  const rows = counts.map((count) => {
    const totalValue = count.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
      0,
    );
    return {
      id: count.id,
      dateLabel: count.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
      itemCount: count.items.length,
      totalValue,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Inventario</h1>
        <Link href="/orders/new" className="text-sm text-neutral-500 hover:underline">
          Ver pedido sugerido
        </Link>
      </div>

      <form
        action={createInventoryCount}
        className="flex items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <div className="space-y-1">
          <label htmlFor="date" className="text-sm font-medium text-neutral-700">
            Fecha del conteo
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={toDateInputValue(new Date())}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Nuevo conteo
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Productos contados</th>
              <th className="px-4 py-2 font-medium">Valor de inventario</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay conteos de inventario.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/inventory/${row.id}`} className="hover:underline">
                    {row.dateLabel}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">{row.itemCount}</td>
                <td className="px-4 py-2 font-medium">{formatMoney(row.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
