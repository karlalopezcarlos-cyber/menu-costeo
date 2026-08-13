import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";

export default async function RequisicionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSucursalContext();

  const requisicion = await prisma.requisicion.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      OR: [{ fromSucursalId: user.sucursalId }, { toSucursalId: user.sucursalId }],
    },
    include: {
      fromSucursal: { select: { name: true } },
      toSucursal: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
      items: {
        include: { product: { select: { name: true } }, subRecipe: { select: { name: true } } },
      },
    },
  });
  if (!requisicion) notFound();

  const total = requisicion.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
    0,
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/requisitions" className="text-sm text-neutral-500 hover:underline">
          ← Requisiciones
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Requisicion {formatRequisicionFolio(requisicion.folio)}
        </h1>
        <p className="text-sm text-neutral-500">
          {requisicion.date.toLocaleDateString("es-MX", { timeZone: "UTC" })} - de{" "}
          <strong>{requisicion.fromSucursal.name}</strong> a{" "}
          <strong>{requisicion.toSucursal.name}</strong>
        </p>
        {requisicion.createdBy && (
          <p className="text-xs text-neutral-400">
            Registrada por {requisicion.createdBy.name ?? requisicion.createdBy.email}
          </p>
        )}
        {requisicion.note && <p className="mt-1 text-sm text-neutral-600">{requisicion.note}</p>}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Producto / Subreceta</th>
              <th className="px-4 py-2 font-medium">Cantidad</th>
              <th className="px-4 py-2 font-medium">Costo unitario</th>
              <th className="px-4 py-2 font-medium">Costo total</th>
            </tr>
          </thead>
          <tbody>
            {requisicion.items.map((item) => (
              <tr key={item.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {item.product?.name ?? item.subRecipe?.name}
                  {item.subRecipeId && (
                    <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      Subreceta
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {item.quantity.toString()} {UNIT_LABELS[item.unit as UnitValue]}
                </td>
                <td className="px-4 py-2 text-neutral-500">{formatMoney(Number(item.unitCost), 4)}</td>
                <td className="px-4 py-2">
                  {formatMoney(Number(item.quantity) * Number(item.unitCost))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Costo total de la requisicion</p>
        <p className="text-xl font-semibold text-neutral-900">{formatMoney(total)}</p>
      </div>
    </div>
  );
}
