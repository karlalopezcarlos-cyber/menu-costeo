import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import PurchasesTable, { type PurchaseRow } from "./PurchasesTable";
import InvoicesTable from "./InvoicesTable";
import { toPurchaseRow } from "./purchase-rows";
import { buildPurchaseWhere, hasAnyPurchaseFilter, resolvePendingProductIds, todayDateInputValue } from "@/lib/purchases/query";
import {
  hasAnyInvoiceFilter,
  loadPurchaseInvoices,
  monthStartDateInputValue,
} from "@/lib/purchases/invoices";

// Tope de seguridad para no traer un historial completo de anios a la pantalla de un jalon:
// si una busqueda sin acotar por fecha regresa mas de esto, se avisa para que se agregue un filtro.
const ROW_LIMIT = 500;

function readParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSucursalContext();
  const raw = await searchParams;
  const tab = readParam(raw.tab) === "facturas" ? "facturas" : "productos";

  const filters = {
    search: readParam(raw.q),
    folio: readParam(raw.folio),
    dateFrom: readParam(raw.from),
    dateTo: readParam(raw.to),
    pendingOnly: readParam(raw.pendingOnly) === "1",
    supplier: readParam(raw.supplier),
  };
  const touched = readParam(raw.touched) === "1";

  // Sin ningun filtro y sin que el usuario haya tocado nada todavia: se acota a las compras de
  // hoy para no cargar el historial completo. En cuanto se usa cualquier filtro, se respeta tal
  // cual (busqueda/folio sin fecha buscan en todo el historial, no solo en el dia).
  const isDefaultToday = !touched && !hasAnyPurchaseFilter(filters);
  const today = todayDateInputValue();
  const effectiveFilters = isDefaultToday ? { ...filters, dateFrom: today, dateTo: today } : filters;

  const suppliersForFilter = await prisma.supplier.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  const supplierOptions = suppliersForFilter.map((s) => s.name);

  if (tab === "facturas") {
    // Aqui el periodo por omision es el mes en curso, no el dia: la pregunta de esta pestana es
    // cuantas facturas entraron en el mes y cuanto suman.
    const invoiceFilters = {
      search: filters.search,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      supplier: filters.supplier,
    };
    const isDefaultMonth = !touched && !hasAnyInvoiceFilter(invoiceFilters);
    const monthStart = monthStartDateInputValue();
    const hoy = todayDateInputValue();
    const effectiveInvoiceFilters = isDefaultMonth
      ? { ...invoiceFilters, dateFrom: monthStart, dateTo: hoy }
      : invoiceFilters;

    const summary = await loadPurchaseInvoices(
      user.sucursalId,
      user.organizationId,
      effectiveInvoiceFilters,
    );

    return (
      <PurchasesShell tab={tab}>
        <InvoicesTable
          rows={summary.rows}
          bySupplier={summary.bySupplier}
          invoiceCount={summary.invoiceCount}
          total={summary.total}
          supplierOptions={supplierOptions}
          filters={invoiceFilters}
          isDefaultMonth={isDefaultMonth}
          defaultFrom={monthStart}
          defaultTo={hoy}
        />
      </PurchasesShell>
    );
  }

  const pendingProductIds = await resolvePendingProductIds(user.sucursalId);
  const pendingIdSet = new Set(pendingProductIds);

  const where = buildPurchaseWhere(
    user.sucursalId,
    effectiveFilters,
    effectiveFilters.pendingOnly ? pendingProductIds : null,
  );

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: [{ purchaseDate: "desc" }, { folio: "desc" }],
    take: ROW_LIMIT,
    include: { product: true, supplier: true },
  });

  const rows: PurchaseRow[] = purchases.map((purchase) =>
    toPurchaseRow(purchase, pendingIdSet.has(purchase.productId)),
  );

  return (
    <PurchasesShell tab={tab}>
      <PurchasesTable
        rows={rows}
        supplierOptions={supplierOptions}
        filters={filters}
        isDefaultToday={isDefaultToday}
        today={today}
        truncated={rows.length === ROW_LIMIT}
      />
    </PurchasesShell>
  );
}

/** Encabezado y pestanas, compartidos por las dos vistas del modulo. */
function PurchasesShell({
  tab,
  children,
}: {
  tab: "productos" | "facturas";
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "productos", label: "Por producto", href: "/purchases" },
    { key: "facturas", label: "Por factura", href: "/purchases?tab=facturas" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Compras</h1>
        <Link
          href="/purchases/new"
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Registrar compra
        </Link>
      </div>

      <nav className="flex gap-4 border-b border-neutral-200 text-sm">
        {tabs.map((item) =>
          item.key === tab ? (
            <span
              key={item.key}
              className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="pb-2 text-neutral-500 transition-colors hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>

      {children}
    </div>
  );
}
