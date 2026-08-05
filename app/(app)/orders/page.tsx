import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatOrderFolio } from "@/lib/orders/folio";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  RECEIVED: "Recibido",
};

export default async function OrdersPage() {
  const user = await requireSucursalContext();

  const orders = await prisma.purchaseOrder.findMany({
    where: { sucursalId: user.sucursalId },
    orderBy: { folio: "desc" },
    include: { items: true, supplier: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Pedidos</h1>
        <div className="flex items-center gap-3">
          <Link href="/orders/stock" className="text-sm text-neutral-500 hover:underline">
            Configurar stock
          </Link>
          <Link
            href="/orders/new"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Ver pedido sugerido
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Folio</th>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Estatus</th>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Productos</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay pedidos. Ve a &quot;Ver pedido sugerido&quot; para crear uno a
                  partir de tus faltantes.
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {formatOrderFolio(order.folio)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {order.createdAt.toLocaleDateString("es-MX", { timeZone: "UTC" })}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      order.status === "RECEIVED"
                        ? "bg-neutral-100 text-neutral-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-500">{order.supplier?.name ?? "-"}</td>
                <td className="px-4 py-2 text-neutral-500">{order.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
