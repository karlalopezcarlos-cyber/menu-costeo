import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney, ZONA_HORARIA } from "@/lib/format";
import RequisicionNota from "./RequisicionNota";
import BorrarRequisicion from "./BorrarRequisicion";

export default async function RequisicionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSucursalContext();

  // El alcance tiene que ser el mismo que el de la lista: ahi quien no es STAFF ve las
  // requisiciones de toda la organizacion, asi que si aqui se filtrara por la sucursal activa,
  // abrir una de otra sucursal desde la lista daria 404.
  const requisicion = await prisma.requisicion.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      ...(user.role === "STAFF"
        ? {
            OR: [
              { fromSucursalId: { in: user.sucursalIds } },
              { toSucursalId: { in: user.sucursalIds } },
            ],
          }
        : {}),
    },
    include: {
      fromSucursal: { select: { name: true } },
      toSucursal: { select: { name: true } },
      createdBy: { select: { name: true, firstName: true, lastName: true, email: true } },
      items: {
        include: { product: { select: { name: true } }, subRecipe: { select: { name: true } } },
      },
    },
  });
  if (!requisicion) notFound();

  // Mismo criterio que la lista y que la accion: solo quien alcanza la sucursal de ORIGEN.
  const puedeBorrar =
    user.role !== "STAFF" || user.sucursalIds.includes(requisicion.fromSucursalId);

  const nombreUsuario = requisicion.createdBy
    ? [requisicion.createdBy.firstName, requisicion.createdBy.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      requisicion.createdBy.name ||
      requisicion.createdBy.email
    : null;

  const total = requisicion.items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
    0,
  );

  // Lo que se le cobra a la otra sucursal. Un renglon sin precio capturado se traspasa a costo
  // y no traslada impuesto, asi que entra con su costo y con cero de IVA.
  const venta = requisicion.items.reduce((sum, item) => {
    const base = Number(item.unitPrice ?? item.unitCost);
    return sum + Number(item.quantity) * base;
  }, 0);
  const iva = requisicion.items.reduce((sum, item) => {
    if (item.unitPrice === null) return sum;
    return sum + Number(item.quantity) * Number(item.unitPrice) * (Number(item.ivaRate) / 100);
  }, 0);
  const hayVentaInterna = requisicion.items.some((item) => item.unitPrice !== null);

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
        {/* La fecha de arriba es el dia de la operacion (un @db.Date, sin hora). La hora real
            sale de createdAt, que es cuando quedo registrada; son dos datos distintos y por eso
            van en renglones separados en vez de pegados. */}
        <p className="text-xs text-neutral-400">
          Registrada el{" "}
          {requisicion.createdAt.toLocaleString("es-MX", {
            timeZone: ZONA_HORARIA,
            dateStyle: "short",
            timeStyle: "short",
          })}
          {nombreUsuario && <> por {nombreUsuario}</>}
        </p>
        <div className="mt-3">
          <RequisicionNota requisicionId={requisicion.id} notaInicial={requisicion.note} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Producto / Subreceta</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Cantidad</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Costo unitario</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Costo total</th>
            </tr>
          </thead>
          <tbody>
            {requisicion.items.map((item) => (
              <tr key={item.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  {item.product?.name ?? item.subRecipe?.name}
                  {item.subRecipeId && (
                    <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      Subreceta
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {item.quantity.toString()} {UNIT_LABELS[item.unit as UnitValue]}
                </td>
                <td className="px-4 py-3 text-neutral-500">{formatMoney(Number(item.unitCost), 4)}</td>
                <td className="px-4 py-3">
                  {formatMoney(Number(item.quantity) * Number(item.unitCost))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <p>Costo para {requisicion.fromSucursal.name}</p>
          <p className="tabular-nums">{formatMoney(total)}</p>
        </div>

        {hayVentaInterna ? (
          <>
            <div className="flex items-center justify-between text-sm text-neutral-500">
              <p>Venta interna (sin IVA)</p>
              <p className="tabular-nums">{formatMoney(venta)}</p>
            </div>
            <div className="flex items-center justify-between text-sm text-neutral-500">
              <p>IVA trasladado</p>
              <p className="tabular-nums">{formatMoney(iva)}</p>
            </div>
            <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
              <p className="text-sm text-neutral-600">Total cobrado a {requisicion.toSucursal.name}</p>
              <p className="text-xl font-semibold tabular-nums text-neutral-900">
                {formatMoney(venta + iva)}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-neutral-500">Ingreso por venta interna</p>
              <p
                className={`font-medium tabular-nums ${
                  venta - total < 0 ? "text-red-600" : "text-neutral-800"
                }`}
              >
                {formatMoney(venta - total)}
              </p>
            </div>
          </>
        ) : (
          <p className="border-t border-neutral-100 pt-2 text-xs text-neutral-400">
            Este traspaso fue a costo: no hay precio de venta interna capturado para estos
            renglones, asi que no genera ingreso ni traslada IVA.
          </p>
        )}
      </div>

      {puedeBorrar && (
        <BorrarRequisicion
          requisicionId={requisicion.id}
          folioLabel={formatRequisicionFolio(requisicion.folio)}
          origen={requisicion.fromSucursal.name}
          destino={requisicion.toSucursal.name}
          renglones={requisicion.items.length}
        />
      )}
    </div>
  );
}
