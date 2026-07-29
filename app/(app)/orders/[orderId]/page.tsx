import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import OrderItemsForm, { type OrderItemRow } from "./OrderItemsForm";
import AddProductToOrder, { type CandidateProduct } from "./AddProductToOrder";
import OrderSendActions from "./OrderSendActions";
import { reopenPurchaseOrder, deletePurchaseOrder } from "./actions";
import { formatOrderFolio } from "@/lib/orders/folio";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  RECEIVED: "Recibido",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await requireOrgSession();

  const [order, suppliers, allProducts, latestCount] = await Promise.all([
    prisma.purchaseOrder.findFirst({
      where: { id: orderId, organizationId: user.organizationId },
      include: {
        items: { include: { product: { include: { presentations: true } } }, orderBy: { createdAt: "asc" } },
        supplier: { select: { name: true, phone: true, email: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { presentations: true },
    }),
    prisma.inventoryCount.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { date: "desc" },
      include: { items: true },
    }),
  ]);
  if (!order) notFound();

  const rows: OrderItemRow[] = order.items.map((item) => ({
    id: item.id,
    productName: item.product.name,
    baseUnit: item.product.baseUnit as UnitValue,
    unitLabel: UNIT_LABELS[item.product.baseUnit as UnitValue],
    presentationLabel: item.presentationLabel,
    quantity: Number(item.quantity),
    comment: item.comment ?? "",
    presentations: [
      ...(item.product.presentationUnitLabel && item.product.presentationUnitQty
        ? [
            {
              id: "legacy",
              label: item.product.presentationUnitLabel,
              quantity: item.product.presentationUnitQty.toString(),
              unit: item.product.baseUnit as UnitValue,
            },
          ]
        : []),
      ...item.product.presentations.map((p) => ({
        id: p.id,
        label: p.label,
        quantity: p.quantity.toString(),
        unit: p.unit as UnitValue,
      })),
    ],
  }));

  const existingProductIds = new Set(order.items.map((item) => item.productId));
  const currentQtyByProductId = new Map(
    (latestCount?.items ?? [])
      .filter((i) => i.productId)
      .map((i) => [i.productId as string, Number(i.quantity)]),
  );
  const candidates: CandidateProduct[] = allProducts
    .filter((product) => !existingProductIds.has(product.id))
    .map((product) => ({
      id: product.id,
      name: product.name,
      baseUnit: product.baseUnit as UnitValue,
      unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
      currentStock: currentQtyByProductId.get(product.id) ?? 0,
      targetStock: Number(product.targetStock),
      presentations: [
        ...(product.presentationUnitLabel && product.presentationUnitQty
          ? [
              {
                id: "legacy",
                label: product.presentationUnitLabel,
                quantity: product.presentationUnitQty.toString(),
                unit: product.baseUnit as UnitValue,
              },
            ]
          : []),
        ...product.presentations.map((p) => ({
          id: p.id,
          label: p.label,
          quantity: p.quantity.toString(),
          unit: p.unit as UnitValue,
        })),
      ],
    }));

  const receiptSummary = order.items.map((item) => {
    const ordered = Number(item.quantity);
    // Si nunca se ha registrado una compra contra este renglon, no hay nada recibido todavia
    // (salvo pedidos ya marcados RECIBIDO antes de que existiera este campo: ahi se asumen
    // completos).
    const received =
      item.receivedQuantity != null
        ? Number(item.receivedQuantity)
        : order.status === "RECEIVED"
          ? ordered
          : 0;
    return {
      id: item.id,
      productName: item.product.name,
      unitLabel: UNIT_LABELS[item.product.baseUnit as UnitValue],
      ordered,
      received,
      pending: Math.max(ordered - received, 0),
    };
  });
  const completeCount = receiptSummary.filter((r) => r.pending <= 0).length;
  const pendingCount = receiptSummary.length - completeCount;
  const hasReceiptData = order.items.some((item) => item.receivedQuantity != null);

  const boundReopen = reopenPurchaseOrder.bind(null, order.id);
  const boundDelete = deletePurchaseOrder.bind(null, order.id);

  const dateLabel = order.createdAt.toLocaleDateString("es-MX", { timeZone: "UTC" });
  const folioLabel = formatOrderFolio(order.folio);
  const messageLines = [
    `Pedido ${folioLabel} - ${dateLabel}`,
    order.supplier ? `Proveedor: ${order.supplier.name}` : null,
    "",
    ...rows.map((r) => `- ${r.productName}: ${r.quantity} ${r.unitLabel} (${r.presentationLabel})`),
    order.comment ? `\nComentarios: ${order.comment}` : null,
  ].filter((line): line is string => line !== null);
  const whatsappMessage = messageLines.join("\n");

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Pedido {folioLabel} - {dateLabel}
          </h1>
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
              order.status === "RECEIVED"
                ? "bg-neutral-100 text-neutral-600"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        <Link href="/orders" className="text-sm text-neutral-500 hover:underline">
          Volver a pedidos
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <a
          href={`/api/export/orders/${order.id}/pdf`}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Descargar PDF para proveedor
        </a>
        <OrderSendActions
          orderId={order.id}
          supplierPhone={order.supplier?.phone ?? null}
          supplierEmail={order.supplier?.email ?? null}
          whatsappMessage={whatsappMessage}
        />
        {order.status === "OPEN" ? (
          <Link
            href={`/purchases/new?pedido=${order.id}`}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Registrar compra de este pedido
          </Link>
        ) : (
          <form action={boundReopen}>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reabrir pedido
            </button>
          </form>
        )}
        <form action={boundDelete} className="ml-auto">
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Eliminar pedido
          </button>
        </form>
      </div>

      {(hasReceiptData || order.status === "RECEIVED") && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">Recepcion</h2>
          <p className="text-sm text-neutral-600">
            {completeCount} de {receiptSummary.length} producto
            {receiptSummary.length === 1 ? "" : "s"} completo
            {completeCount === 1 ? "" : "s"}
            {pendingCount > 0 ? `, ${pendingCount} con faltante` : ""}.
          </p>
          <div className="divide-y divide-neutral-100 text-sm">
            {receiptSummary.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="text-neutral-800">{r.productName}</span>
                <span className="text-neutral-500">
                  {r.received.toLocaleString("es-MX", { maximumFractionDigits: 2 })} de{" "}
                  {r.ordered.toLocaleString("es-MX", { maximumFractionDigits: 2 })} {r.unitLabel} recibidos
                  {r.pending > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Pendiente: {r.pending.toLocaleString("es-MX", { maximumFractionDigits: 2 })}{" "}
                      {r.unitLabel}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <OrderItemsForm
        orderId={order.id}
        rows={rows}
        suppliers={suppliers}
        initialSupplierId={order.supplierId ?? ""}
        initialComment={order.comment ?? ""}
      />

      <AddProductToOrder orderId={order.id} candidates={candidates} />
    </div>
  );
}
