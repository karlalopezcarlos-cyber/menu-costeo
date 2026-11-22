import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import VentasInternasTable, { type VentaInternaRow } from "./VentasInternasTable";

/**
 * Ventas internas: lo que esta sucursal le cobro a las demas por traspasarles mercancia.
 *
 * No es un modulo de captura: cada renglon es un renglon de una requisicion que salio de aqui y
 * que tenia precio de venta interna. El ingreso es la diferencia contra lo que costaba, y es el
 * mismo numero que aparece como "Utilidad en ventas internas" en el Estado de Resultados.
 */
export default async function InternalSalesPage() {
  const user = await requireSucursalContext();

  const items = await prisma.requisicionItem.findMany({
    where: {
      requisicion: { fromSucursalId: user.sucursalId, organizationId: user.organizationId },
      unitPrice: { not: null },
    },
    orderBy: [{ requisicion: { date: "desc" } }, { requisicion: { folio: "desc" } }],
    take: 1000,
    include: {
      product: { select: { name: true } },
      subRecipe: { select: { name: true } },
      requisicion: {
        select: {
          id: true,
          folio: true,
          date: true,
          createdAt: true,
          toSucursal: { select: { id: true, name: true } },
          createdBy: { select: { name: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  const rows: VentaInternaRow[] = items.map((item) => {
    const cantidad = Number(item.quantity);
    const costo = Number(item.unitCost);
    const precio = Number(item.unitPrice);
    const u = item.requisicion.createdBy;
    const usuario = u
      ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || u.email
      : "Sin usuario";

    return {
      id: item.id,
      requisicionId: item.requisicion.id,
      folioLabel: formatRequisicionFolio(item.requisicion.folio),
      fechaISO: item.requisicion.date.toISOString().slice(0, 10),
      fechaLabel: item.requisicion.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
      destinoId: item.requisicion.toSucursal.id,
      destinoName: item.requisicion.toSucursal.name,
      usuario,
      concepto: item.product?.name ?? item.subRecipe?.name ?? "(sin nombre)",
      esSubreceta: item.subRecipeId !== null,
      cantidad,
      unidad: UNIT_LABELS[item.unit as UnitValue],
      costoUnitario: costo,
      precioUnitario: precio,
      costoTotal: cantidad * costo,
      ventaTotal: cantidad * precio,
      ingreso: cantidad * (precio - costo),
    };
  });

  const destinos = [...new Map(rows.map((r) => [r.destinoId, r.destinoName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const usuarios = [...new Set(rows.map((r) => r.usuario))]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((nombre) => ({ id: nombre, name: nombre }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ventas internas</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Lo que esta sucursal le cobro a las demas por traspasarles producto. El ingreso es la
            diferencia contra lo que costaba.
          </p>
        </div>
        <Link
          href="/internal-sales/precios"
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Precios de traspaso
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm">
          <p className="font-medium text-neutral-700">Todavia no hay ventas internas.</p>
          <p className="mt-2">
            Una venta interna se registra sola: en cuanto captures un precio de traspaso y mandes
            una requisicion con ese producto, el renglon aparece aqui. Mientras no haya precio, el
            traspaso se sigue haciendo a costo y no genera ingreso.
          </p>
          <Link
            href="/internal-sales/precios"
            className="mt-3 inline-block font-medium text-neutral-800 underline underline-offset-2"
          >
            Capturar precios de traspaso
          </Link>
        </div>
      ) : (
        <VentasInternasTable rows={rows} destinos={destinos} usuarios={usuarios} />
      )}

      <p className="text-xs text-neutral-400">
        La asignacion de estos ingresos a una cuenta todavia no existe; es el siguiente paso.
      </p>
    </div>
  );
}
