import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatStoreOrderFolio } from "@/lib/store/folio";
import StoreOrdersTable, { type StoreOrderRow } from "./StoreOrdersTable";

export default async function StoreOrdersPage() {
  const user = await requireSucursalContext();

  const [orders, sucursal] = await Promise.all([
    prisma.storeOrder.findMany({
      where: { sucursalId: user.sucursalId },
      orderBy: { folio: "desc" },
      take: 200,
      include: { items: { include: { recipe: { select: { name: true } } } } },
    }),
    prisma.sucursal.findUnique({
      where: { id: user.sucursalId },
      select: { storeSlug: true, storeEnabled: true },
    }),
  ]);

  const rows: StoreOrderRow[] = orders.map((order) => ({
    id: order.id,
    folioLabel: formatStoreOrderFolio(order.folio),
    dateLabel: order.createdAt.toLocaleString("es-MX", { timeZone: "UTC" }),
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    fulfillmentType: order.fulfillmentType,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    deliveryAddress: order.deliveryAddress,
    deliveryFee: Number(order.deliveryFee),
    requestedDeliveryDateLabel: order.requestedDeliveryDate
      ? order.requestedDeliveryDate.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
      : null,
    requestedDeliveryTime: order.requestedDeliveryTime,
    confirmed: !!order.confirmedAt,
    comment: order.comment,
    packagingNotes: order.packagingNotes,
    total: Number(order.total),
    items: order.items.map((item) => ({
      name: item.recipe.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Pedidos en linea</h1>
          <p className="text-sm text-neutral-500">Pedidos hechos por clientes desde tu tienda publica.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/planning/plu" className="text-sm text-neutral-500 hover:underline">
            Planear produccion
          </Link>
          <Link href="/settings/store" className="text-sm text-neutral-500 hover:underline">
            Configurar tienda
          </Link>
        </div>
      </div>

      {!sucursal?.storeEnabled && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Tu tienda en linea todavia no esta habilitada. Ve a{" "}
          <Link href="/settings/store" className="underline">
            Configuracion
          </Link>{" "}
          para activarla.
        </p>
      )}

      <StoreOrdersTable rows={rows} />
    </div>
  );
}
