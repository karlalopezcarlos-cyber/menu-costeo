import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatSaleFolio } from "@/lib/sales/folio";
import { formatMoney } from "@/lib/format";

export default async function SaleTicketsPage() {
  const user = await requireSucursalContext();

  const tickets = await prisma.saleTicket.findMany({
    where: { sucursalId: user.sucursalId },
    include: { items: true },
    orderBy: { folio: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Tickets de venta</h1>
          <p className="text-sm text-neutral-500">Historial de ventas capturadas como ticket.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sales" className="text-sm text-neutral-500 hover:underline">
            Ver Ventas
          </Link>
          <Link
            href="/sales/new"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Registrar venta
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Platillos</th>
              <th className="px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay tickets de venta.
                </td>
              </tr>
            )}
            {tickets.map((ticket) => {
              const total = ticket.items.reduce(
                (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
                0,
              );
              return (
                <tr key={ticket.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <Link href={`/sales/tickets/${ticket.id}`} className="font-medium text-neutral-900 hover:underline">
                      {formatSaleFolio(ticket.folio)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {ticket.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{ticket.items.length}</td>
                  <td className="px-4 py-2">{formatMoney(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
