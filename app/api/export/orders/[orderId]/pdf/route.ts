import { NextResponse } from "next/server";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildOrderPdf, type OrderPdfItem } from "@/lib/pdf/export-order";
import { formatOrderItemQuantityLabel } from "@/lib/orders/quantity-label";
import { formatOrderFolio } from "@/lib/orders/folio";

export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireSucursalContext();
  const { orderId } = await params;

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, sucursalId: user.sucursalId },
    include: {
      items: { include: { product: { include: { presentations: true } } }, orderBy: { createdAt: "asc" } },
      supplier: true,
    },
  });
  if (!order) {
    return new NextResponse("Pedido no encontrado", { status: 404 });
  }

  const items: OrderPdfItem[] = order.items.map((item) => ({
    productName: item.product.name,
    presentationLabel: item.presentationLabel,
    quantityLabel: formatOrderItemQuantityLabel(item.quantity, item.presentationLabel, item.product),
    comment: item.comment,
  }));

  const buffer = await buildOrderPdf({
    folioLabel: formatOrderFolio(order.folio),
    dateLabel: order.createdAt.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    supplierName: order.supplier?.name ?? null,
    comment: order.comment,
    items,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pedido-${order.id}.pdf"`,
    },
  });
}
