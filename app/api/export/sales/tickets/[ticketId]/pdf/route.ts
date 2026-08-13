import { NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildSaleTicketPdf, type SaleTicketPdfItem } from "@/lib/pdf/export-sale-ticket";
import { getOrganizationLogo } from "@/lib/pdf/get-organization-logo";
import { formatSaleFolio } from "@/lib/sales/folio";
import { formatMoney } from "@/lib/format";

export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const user = await requireSucursalContext();
  const { ticketId } = await params;

  const ticket = await prisma.saleTicket.findFirst({
    where: { id: ticketId, sucursalId: user.sucursalId },
    include: {
      items: { include: { recipe: true } },
      sucursal: true,
      organization: true,
    },
  });
  if (!ticket) {
    return new NextResponse("Ticket no encontrado", { status: 404 });
  }

  const items: SaleTicketPdfItem[] = ticket.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    return {
      recipeName: item.recipe.name,
      quantity: quantity.toLocaleString("es-MX", { maximumFractionDigits: 2 }),
      unitPriceLabel: formatMoney(unitPrice),
      totalLabel: formatMoney(quantity * unitPrice),
    };
  });
  const total = ticket.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

  const logo = await getOrganizationLogo(user.organizationId);

  const buffer = await buildSaleTicketPdf(
    {
      folioLabel: formatSaleFolio(ticket.folio),
      dateLabel: ticket.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
      organizationName: ticket.organization.name,
      sucursalName: ticket.sucursal.name,
      items,
      totalLabel: formatMoney(total),
    },
    logo,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${formatSaleFolio(ticket.folio)}.pdf"`,
    },
  });
}
