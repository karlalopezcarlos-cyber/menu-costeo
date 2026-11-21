import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import { ZONA_HORARIA } from "@/lib/format";
import RequisicionesTable, { type RequisicionRow, type Opcion } from "./RequisicionesTable";

type UsuarioLike = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
} | null;

/** Mismo criterio que el Kardex: nombre y apellido si existen, si no el alias, si no el correo. */
function nombreDe(u: UsuarioLike): string {
  if (!u) return "Sin usuario";
  const completo = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return completo || u.name || u.email;
}

export default async function RequisitionsPage() {
  const user = await requireSucursalContext();

  // Quien no es STAFF ve las requisiciones de toda la organizacion y filtra por sucursal desde
  // la tabla; el STAFF sigue viendo solo las sucursales que tiene asignadas.
  const esDueno = user.role !== "STAFF";
  const sucursales = await prisma.sucursal.findMany({
    where: esDueno
      ? { organizationId: user.organizationId }
      : { id: { in: user.sucursalIds } },
    orderBy: [{ isCentral: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const alcance = new Set(sucursales.map((s) => s.id));

  const requisiciones = await prisma.requisicion.findMany({
    where: {
      organizationId: user.organizationId,
      ...(esDueno
        ? {}
        : {
            OR: [
              { fromSucursalId: { in: user.sucursalIds } },
              { toSucursalId: { in: user.sucursalIds } },
            ],
          }),
    },
    orderBy: { folio: "desc" },
    take: 300,
    include: {
      fromSucursal: { select: { name: true } },
      toSucursal: { select: { name: true } },
      createdBy: { select: { name: true, firstName: true, lastName: true, email: true } },
      items: { select: { quantity: true, unitCost: true } },
    },
  });

  const rows: RequisicionRow[] = requisiciones.map((r) => ({
    id: r.id,
    folio: r.folio,
    folioLabel: formatRequisicionFolio(r.folio),
    // La fecha es un @db.Date (el dia de la operacion) y se lee en UTC; la hora sale de
    // createdAt, que si es un instante real, y se lee en la hora del negocio.
    fechaISO: r.date.toISOString().slice(0, 10),
    fechaLabel: r.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    horaLabel: r.createdAt.toLocaleTimeString("es-MX", {
      timeZone: ZONA_HORARIA,
      timeStyle: "short",
    }),
    creadaEn: r.createdAt.getTime(),
    fromSucursalId: r.fromSucursalId,
    fromSucursalName: r.fromSucursal.name,
    toSucursalId: r.toSucursalId,
    toSucursalName: r.toSucursal.name,
    direction:
      r.fromSucursalId === user.sucursalId
        ? "enviada"
        : r.toSucursalId === user.sucursalId
          ? "recibida"
          : "ajena",
    usuario: nombreDe(r.createdBy),
    itemCount: r.items.length,
    total: r.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0),
    note: r.note,
    // Solo la sucursal que la envio puede borrarla: quien recibe no deberia poder desaparecer
    // un envio que alguien mas registro.
    puedeBorrar: alcance.has(r.fromSucursalId),
  }));

  const usuarios: Opcion[] = [...new Set(rows.map((r) => r.usuario))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((nombre) => ({ id: nombre, name: nombre }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Requisiciones</h1>
        <Link
          href="/requisitions/new"
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Nueva requisicion
        </Link>
      </div>

      <RequisicionesTable rows={rows} sucursales={sucursales} usuarios={usuarios} />
    </div>
  );
}
