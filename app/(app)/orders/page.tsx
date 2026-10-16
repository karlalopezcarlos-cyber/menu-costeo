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
  searchParams: Promise<{ view?: string; nuevos?: string }>;
}) {
  const user = await requireSucursalContext();
  const { view, nuevos } = await searchParams;
  const showReceived = view === "received";

  // Al crear un pedido por proveedor salen varios de un jalon: se listan arriba con su folio para
  // poder abrir cada uno y mandarselo a su proveedor sin buscarlos en la tabla.
  const nuevosIds = (nuevos ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  const [orders, pedidosNuevos] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { sucursalId: user.sucursalId, status: showReceived ? "RECEIVED" : "OPEN" },
      orderBy: { folio: "desc" },
      include: { items: true, supplier: true },
    }),
    nuevosIds.length > 0
      ? prisma.purchaseOrder.findMany({
          where: { id: { in: nuevosIds }, sucursalId: user.sucursalId },
          orderBy: { folio: "asc" },
          include: {
            items: { select: { id: true } },
            supplier: { select: { name: true, phone: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const sinContacto = pedidosNuevos.filter(
    (order) => order.supplier && !order.supplier.phone && !order.supplier.email,
  ).length;
  const sinProveedor = pedidosNuevos.filter((order) => !order.supplier).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pedidos</h1>
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
      {pedidosNuevos.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            {pedidosNuevos.length === 1
              ? "Se creo 1 pedido"
              : `Se crearon ${pedidosNuevos.length} pedidos, uno por proveedor`}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            {pedidosNuevos.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/orders/${order.id}`} className="font-medium underline">
                  {formatOrderFolio(order.folio)}
                </Link>
                <span>{order.supplier?.name ?? "Sin proveedor asignado"}</span>
                <span className="text-emerald-700">
                  · {order.items.length} producto{order.items.length === 1 ? "" : "s"}
                </span>
                {order.supplier && !order.supplier.phone && !order.supplier.email && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    sin telefono ni correo
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-emerald-700">
            Abre cada uno para mandarlo por WhatsApp o correo con los datos de su proveedor.
            {sinContacto > 0 && (
              <>
                {" "}
                <Link href="/settings/suppliers" className="font-medium underline">
                  Completa el contacto
                </Link>{" "}
                de los proveedores que todavia no lo tienen.
              </>
            )}
            {sinProveedor > 0 && (
              <>
                {" "}
                <Link href="/products/suppliers" className="font-medium underline">
                  Asigna el proveedor habitual
                </Link>{" "}
                de los productos que quedaron sueltos para que la proxima vez ya salgan separados.
              </>
            )}
          </p>
        </div>
      )}

      <p className="text-sm text-neutral-500">
        {showReceived
          ? "Pedidos ya recibidos por completo. Su historial de recepcion queda registrado en Compras."
          : "Un pedido desaparece de aqui en cuanto se recibe por completo; a partir de ahi solo queda su historial en Compras."}
      </p>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Folio</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Fecha</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Estatus</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Proveedor</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Productos</th>
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
              <tr key={order.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                    {formatOrderFolio(order.folio)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {order.createdAt.toLocaleDateString("es-MX", { timeZone: "UTC" })}
                </td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 text-neutral-500">{order.supplier?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-500">{order.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
