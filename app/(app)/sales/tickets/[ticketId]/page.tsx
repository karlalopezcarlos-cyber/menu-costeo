import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatSaleFolio } from "@/lib/sales/folio";
import { formatMoney } from "@/lib/format";
import DeleteTicketButton from "./DeleteTicketButton";
import PaymentLinkActions from "./PaymentLinkActions";

export default async function SaleTicketDetailPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const user = await requireSucursalContext();
  const { ticketId } = await params;

  const ticket = await prisma.saleTicket.findFirst({
    where: { id: ticketId, sucursalId: user.sucursalId },
    include: { items: { include: { recipe: true } } },
  });
  if (!ticket) notFound();

  const total = ticket.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Ticket {formatSaleFolio(ticket.folio)}</h1>
          <p className="text-sm text-neutral-500">
            {ticket.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/export/sales/tickets/${ticket.id}/pdf`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Descargar PDF
          </a>
          <DeleteTicketButton ticketId={ticket.id} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Platillo</th>
              <th className="px-4 py-2 font-medium">Cantidad</th>
              <th className="px-4 py-2 font-medium">Precio</th>
              <th className="px-4 py-2 font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {ticket.items.map((item) => (
              <tr key={item.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{item.recipe.name}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {Number(item.quantity).toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2 text-neutral-500">{formatMoney(Number(item.unitPrice))}</td>
                <td className="px-4 py-2">{formatMoney(Number(item.quantity) * Number(item.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Total del ticket</p>
        <p className="text-xl font-semibold text-neutral-900">{formatMoney(total)}</p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-neutral-700">Cobro con Mercado Pago</p>
        <PaymentLinkActions
          ticketId={ticket.id}
          folioLabel={formatSaleFolio(ticket.folio)}
          totalLabel={formatMoney(total)}
          initialPaymentLink={ticket.paymentLink}
        />
      </div>

      <Link href="/sales/tickets" className="text-sm text-neutral-500 hover:underline">
        ← Volver a Tickets de venta
      </Link>
    </div>
  );
}
