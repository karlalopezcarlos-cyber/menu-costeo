import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatSaleFolio } from "@/lib/sales/folio";
import { formatDateTime } from "@/lib/format";
import SalesManager from "./SalesManager";
import type { SaleRow } from "./SalesTable";
import DailySalesTable, { type DailySalesInput } from "./DailySalesTable";
import SalesLogTable, { type SaleLogRow } from "./SalesLogTable";
import PeriodFilter from "./PeriodFilter";
import type { IvaMode } from "@/lib/menu-engineering";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vista?: string; iva?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSucursalContext();

  const vistaDiaria = params.vista === "dia";
  const vistaBitacora = params.vista === "bitacora";
  const ivaMode: IvaMode = params.iva === "sin" ? "sin" : "con";

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const from = params.from ? new Date(`${params.from}T00:00:00Z`) : defaultFrom;
  const to = params.to ? new Date(`${params.to}T00:00:00Z`) : defaultTo;

  const [recipes, sales, tickets, ediciones] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sellingPrice: true },
    }),
    prisma.dailySale.findMany({
      where: { sucursalId: user.sucursalId, date: { gte: from, lte: to } },
      include: { recipe: true, createdBy: { select: { name: true, email: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.saleTicket.findMany({
      where: { sucursalId: user.sucursalId, date: { gte: from, lte: to } },
      include: { items: true },
    }),
    // Correcciones hechas a mano sobre las ventas del periodo: cuantas y cuando fue la ultima.
    prisma.dailySaleChange.groupBy({
      by: ["dailySaleId"],
      where: {
        sucursalId: user.sucursalId,
        action: "update",
        date: { gte: from, lte: to },
        dailySaleId: { not: null },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
  ]);

  // Cada renglon de ticket tambien incrementa el DailySale del mismo (recipe, fecha); aqui
  // reconstruimos esa relacion en sentido inverso para poder mostrar en Ventas de que ticket(s)
  // viene cada fila agregada (una fila puede juntar mas de un ticket del mismo dia).
  const ticketsByRecipeDate = new Map<string, { id: string; folioLabel: string }[]>();
  for (const ticket of tickets) {
    const dateKey = ticket.date.toISOString().slice(0, 10);
    for (const item of ticket.items) {
      const key = `${item.recipeId}|${dateKey}`;
      const list = ticketsByRecipeDate.get(key) ?? [];
      list.push({ id: ticket.id, folioLabel: formatSaleFolio(ticket.folio) });
      ticketsByRecipeDate.set(key, list);
    }
  }

  const bitacora = vistaBitacora
    ? await prisma.dailySaleChange.findMany({
        where: { sucursalId: user.sucursalId, date: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          recipe: { select: { name: true } },
          changedBy: { select: { name: true, email: true } },
        },
      })
    : [];

  const bitacoraRows: SaleLogRow[] = bitacora.map((cambio) => ({
    id: cambio.id,
    whenLabel: formatDateTime(cambio.createdAt),
    saleDateLabel: cambio.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    recipeName: cambio.recipe.name,
    action: cambio.action,
    previousQuantity: cambio.previousQuantity ? Number(cambio.previousQuantity) : null,
    newQuantity: cambio.newQuantity ? Number(cambio.newQuantity) : null,
    previousPrice: cambio.previousPrice ? Number(cambio.previousPrice) : null,
    newPrice: cambio.newPrice ? Number(cambio.newPrice) : null,
    source: cambio.source,
    userName: cambio.changedBy?.name ?? cambio.changedBy?.email ?? null,
  }));

  const edicionesPorVenta = new Map(
    ediciones.map((e) => [e.dailySaleId as string, { veces: e._count._all, ultima: e._max.createdAt }]),
  );

  const rows: SaleRow[] = sales.map((sale) => {
    const dateKey = sale.date.toISOString().slice(0, 10);
    const tickets = ticketsByRecipeDate.get(`${sale.recipeId}|${dateKey}`) ?? [];
    const edicion = edicionesPorVenta.get(sale.id);
    return {
      id: sale.id,
      recipeId: sale.recipeId,
      dateLabel: sale.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
      dateValue: sale.date.getTime(),
      dateInputValue: sale.date.toISOString().slice(0, 10),
      recipeName: sale.recipe.name,
      quantitySold: Number(sale.quantitySold),
      unitPrice: Number(sale.unitPrice),
      source: sale.source,
      tickets,
      capturedBy: sale.createdBy?.name ?? sale.createdBy?.email ?? null,
      edits: edicion?.veces ?? 0,
      lastEditLabel: edicion?.ultima
        ? formatDateTime(edicion.ultima)
        : null,
    };
  });

  // La venta de cada dia sale de las mismas filas: una venta diaria ya trae juntos lo importado
  // y lo capturado a mano o por ticket.
  const porDia = new Map<string, DailySalesInput>();
  for (const sale of sales) {
    const dateKey = sale.date.toISOString().slice(0, 10);
    const importe = Number(sale.quantitySold) * Number(sale.unitPrice);
    const actual = porDia.get(dateKey);
    if (actual) {
      actual.quantity += Number(sale.quantitySold);
      actual.grossTotal += importe;
      actual.dishes += 1;
    } else {
      porDia.set(dateKey, {
        dateKey,
        dateLabel: sale.date.toLocaleDateString("es-MX", {
          timeZone: "UTC",
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
        quantity: Number(sale.quantitySold),
        grossTotal: importe,
        dishes: 1,
      });
    }
  }
  const dias = [...porDia.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));

  const periodoQuery = `from=${toDateInputValue(from)}&to=${toDateInputValue(to)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ventas</h1>
        <div className="flex items-center gap-3">
          <Link href="/sales/tickets" className="text-sm text-neutral-500 hover:underline">
            Ver tickets de venta
          </Link>
          <Link href="/sales/aliases" className="text-sm text-neutral-500 hover:underline">
            Vinculaciones
          </Link>
          <a
            href="/api/export/sales-template"
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Descargar plantilla
          </a>
          <Link
            href="/sales/import"
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Importar desde Excel
          </Link>
          <Link
            href="/sales/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Registrar venta
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-neutral-200">
        <Link
          href={`/sales?${periodoQuery}`}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            vistaDiaria || vistaBitacora
              ? "border-transparent text-neutral-500 hover:text-neutral-800"
              : "border-neutral-900 text-neutral-900"
          }`}
        >
          Ventas por producto
        </Link>
        <Link
          href={`/sales?${periodoQuery}&vista=dia&iva=${ivaMode}`}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            vistaDiaria
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Ventas por dia
        </Link>
        <Link
          href={`/sales?${periodoQuery}&vista=bitacora`}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            vistaBitacora
              ? "border-neutral-900 text-neutral-900"
              : "border-transparent text-neutral-500 hover:text-neutral-800"
          }`}
        >
          Bitacora
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <PeriodFilter from={toDateInputValue(from)} to={toDateInputValue(to)} />

        {vistaDiaria && (
          <div className="ml-auto inline-flex overflow-hidden rounded-md border border-neutral-200">
            <Link
              href={`/sales?${periodoQuery}&vista=dia&iva=con`}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                ivaMode === "con" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              Con IVA
            </Link>
            <Link
              href={`/sales?${periodoQuery}&vista=dia&iva=sin`}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                ivaMode === "sin" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              Sin IVA
            </Link>
          </div>
        )}
      </div>

      {vistaBitacora ? (
        <SalesLogTable rows={bitacoraRows} />
      ) : vistaDiaria ? (
        <DailySalesTable days={dias} iva={ivaMode} />
      ) : (
        <>
          {recipes.length === 0 && (
            <p className="text-sm text-neutral-500">
              Todavia no tienes platillos de menu. Marca una receta como &quot;platillo de
              menu&quot; para que aparezca aqui.
            </p>
          )}

          <SalesManager
            recipes={recipes.map((r) => ({
              id: r.id,
              name: r.name,
              sellingPrice: r.sellingPrice ? r.sellingPrice.toString() : null,
            }))}
            rows={rows}
          />
        </>
      )}
    </div>
  );
}
