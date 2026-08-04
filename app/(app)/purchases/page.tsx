import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import PurchasesTable, { type PurchaseRow } from "./PurchasesTable";
import { toPurchaseRow } from "./purchase-rows";
import { buildPurchaseWhere, hasAnyPurchaseFilter, resolvePendingProductIds, todayDateInputValue } from "@/lib/purchases/query";

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
  const user = await requireOrgSession();
  const raw = await searchParams;

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

  const pendingProductIds = await resolvePendingProductIds(user.organizationId);
  const pendingIdSet = new Set(pendingProductIds);

  const where = buildPurchaseWhere(
    user.organizationId,
    effectiveFilters,
    effectiveFilters.pendingOnly ? pendingProductIds : null,
  );

  const [purchases, suppliers] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: "desc" }, { folio: "desc" }],
      take: ROW_LIMIT,
      include: { product: true, supplier: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
  ]);

  const rows: PurchaseRow[] = purchases.map((purchase) =>
    toPurchaseRow(purchase, pendingIdSet.has(purchase.productId)),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Compras</h1>
        <Link
          href="/purchases/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Registrar compra
        </Link>
      </div>

      <PurchasesTable
        rows={rows}
        supplierOptions={suppliers.map((s) => s.name)}
        filters={filters}
        isDefaultToday={isDefaultToday}
        today={today}
        truncated={rows.length === ROW_LIMIT}
      />
    </div>
  );
}
