import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { monthStartDateInputValue, todayDateInputValue } from "@/lib/date-inputs";
import {
  computeKardexOpening,
  computeKardexTotals,
  filterKardexRows,
  loadKardexRows,
} from "@/lib/kardex";
import { readKardexFilters } from "@/lib/kardex-filters";
import KardexTable from "./KardexTable";

// Tope de renglones en pantalla. El Excel no lo trae: ahi si se baja todo lo filtrado.
const ROW_LIMIT = 2000;

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSucursalContext();
  const raw = await searchParams;
  const readParam = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  };
  const filters = readKardexFilters(readParam);
  const touched = readParam("touched") === "1";

  // Por omision, el mes en curso.
  const isDefaultMonth = !touched && !filters.dateFrom && !filters.dateTo;
  const monthStart = monthStartDateInputValue();
  const today = todayDateInputValue();
  const dateFrom = filters.dateFrom || monthStart;
  const dateTo = filters.dateTo || today;

  const [allRows, products, usuarios] = await Promise.all([
    loadKardexRows(user.organizationId, user.sucursalId, {
      productId: filters.productId || undefined,
      dateFrom,
      dateTo,
    }),
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { name: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const filtered = filterKardexRows(allRows, filters);
  const totals = computeKardexTotals(filtered);
  const rows = filtered.slice(0, ROW_LIMIT);

  // El saldo inicial y el corrido solo tienen sentido con un producto a la vez.
  const opening = filters.productId
    ? await computeKardexOpening(user.organizationId, user.sucursalId, filters.productId, dateFrom)
    : null;
  const productName = filters.productId
    ? (products.find((p) => p.id === filters.productId)?.name ?? null)
    : null;

  const userNames = [
    ...new Set(
      usuarios
        .map((u) => [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || u.email)
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Analisis
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Kardex</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Todo lo que entro y salio de inventario en el periodo, movimiento por movimiento, con
            quien lo capturo y a que hora. Elige un producto para ver su saldo corrido: con cuanto
            empezo, que le paso y con cuanto deberia quedar.
          </p>
        </div>
      </div>

      <KardexTable
        rows={rows}
        totals={totals}
        filters={filters}
        products={products}
        users={userNames}
        opening={opening}
        productName={productName}
        isDefaultMonth={isDefaultMonth}
        defaultFrom={monthStart}
        defaultTo={today}
        truncated={filtered.length > ROW_LIMIT}
      />
    </div>
  );
}
