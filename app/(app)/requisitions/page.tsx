import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import RequisicionesTable, { type RequisicionRow } from "./RequisicionesTable";

export default async function RequisitionsPage() {
  const user = await requireSucursalContext();

  const requisiciones = await prisma.requisicion.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [{ fromSucursalId: user.sucursalId }, { toSucursalId: user.sucursalId }],
    },
    orderBy: { folio: "desc" },
    take: 300,
    include: {
      fromSucursal: { select: { name: true } },
      toSucursal: { select: { name: true } },
      items: { select: { quantity: true, unitCost: true } },
    },
  });

  const rows: RequisicionRow[] = requisiciones.map((r) => ({
    id: r.id,
    folioLabel: formatRequisicionFolio(r.folio),
    dateLabel: r.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: r.date.getTime(),
    fromSucursalName: r.fromSucursal.name,
    toSucursalName: r.toSucursal.name,
    direction: r.fromSucursalId === user.sucursalId ? "enviada" : "recibida",
    itemCount: r.items.length,
    total: r.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0),
    note: r.note,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Requisiciones</h1>
        <Link
          href="/requisitions/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Nueva requisicion
        </Link>
      </div>

      <RequisicionesTable rows={rows} />
    </div>
  );
}
