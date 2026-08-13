import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatOrderFolio } from "@/lib/orders/folio";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierto",
  RECEIVED: "Recibido",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireSucursalContext();
  const { view } = await searchParams;
  const showReceived = view === "received";

  const orders = await prisma.purchaseOrder.findMany({
    where: { sucursalId: user.sucursalId, status: showReceived ? "RECEIVED" : "OPEN" },
    orderBy: { folio: "desc" },
    include: { items: true, supplier: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Pedidos</h1>
        <div className="flex items-center gap-3">
          {showReceived ? (
            <Link href="/orders" className="text-sm text-neutral-500 hover:underline">
              Ver abiertos
            </Link>
          ) : (
            <Link href="/orders?view=received" className="text-sm text-neutral-500 hover:underline">
              Ver recibidos
            </Link>
          )}
          <Link href="/planning" className="text-sm text-neutral-500 hover:underline">
            Ir a Proyeccion
          </Link>
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        {showReceived
          ? "Pedidos ya recibidos por completo. Su historial de recepcion queda registrado en Compras."
          : "Un pedido desaparece de aqui en cuanto se recibe por completo; a partir de ahi solo queda su historial en Compras."}
      </p>

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
                  {showReceived
                    ? "Todavia no hay pedidos recibidos."
                    : (
                      <>
                        Todavia no hay pedidos abiertos. Ve a &quot;Proyeccion&quot; para crear uno a
                        partir de tus faltantes o de tu planeacion de ventas.
                      </>
                    )}
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
