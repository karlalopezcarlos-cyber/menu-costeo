import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { computeInventoryAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/format";

function inventoryValue(items: { quantity: unknown; unitCost: unknown }[]): number {
  return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ initial?: string; final?: string }>;
}) {
  const params = await searchParams;
  const user = await requireOrgSession();

  const counts = await prisma.inventoryCount.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { date: "asc" },
    select: { id: true, date: true },
  });

  if (counts.length < 2) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Panel</h1>
        <p className="text-sm text-neutral-500">
          Necesitas al menos dos conteos de inventario (inicial y final) para ver el costeo del
          periodo. Ve a Inventario y registra otro conteo.
        </p>
      </div>
    );
  }

  const defaultFinal = counts[counts.length - 1];
  const defaultInitial = counts[counts.length - 2];

  const initialCountId = params.initial && counts.some((c) => c.id === params.initial)
    ? params.initial
    : defaultInitial.id;
  const finalCountId = params.final && counts.some((c) => c.id === params.final)
    ? params.final
    : defaultFinal.id;

  const [initialCount, finalCount] = await Promise.all([
    prisma.inventoryCount.findFirst({
      where: { id: initialCountId, organizationId: user.organizationId },
      include: { items: true },
    }),
    prisma.inventoryCount.findFirst({
      where: { id: finalCountId, organizationId: user.organizationId },
      include: { items: true },
    }),
  ]);
  if (!initialCount || !finalCount) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Panel</h1>
        <p className="text-sm text-neutral-500">Conteo de inventario no encontrado.</p>
      </div>
    );
  }

  const rangeStart = initialCount.date <= finalCount.date ? initialCount.date : finalCount.date;
  const rangeEnd = initialCount.date <= finalCount.date ? finalCount.date : initialCount.date;
  const auditInitialCountId = initialCount.date <= finalCount.date ? initialCount.id : finalCount.id;
  const auditFinalCountId = initialCount.date <= finalCount.date ? finalCount.id : initialCount.id;

  const [purchaseSum, sales, wasteEntries, audit] = await Promise.all([
    prisma.purchase.aggregate({
      _sum: { totalPrice: true },
      where: {
        organizationId: user.organizationId,
        purchaseDate: { gte: rangeStart, lte: rangeEnd },
      },
    }),
    prisma.dailySale.findMany({
      where: { organizationId: user.organizationId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { quantitySold: true, unitPrice: true },
    }),
    prisma.wasteEntry.findMany({
      where: { organizationId: user.organizationId, date: { gte: rangeStart, lte: rangeEnd } },
      select: { quantity: true, unitCost: true },
    }),
    computeInventoryAudit(user.organizationId, auditInitialCountId, auditFinalCountId),
  ]);

  const initialValue = inventoryValue(initialCount.items);
  const finalValue = inventoryValue(finalCount.items);
  const totalPurchases = Number(purchaseSum._sum.totalPrice ?? 0);
  const totalSales = sales.reduce((sum, s) => sum + Number(s.quantitySold) * Number(s.unitPrice), 0);
  const totalWaste = wasteEntries.reduce((sum, w) => sum + Number(w.quantity) * Number(w.unitCost), 0);

  const costPct = totalSales > 0 ? ((initialValue + totalPurchases - finalValue) / totalSales) * 100 : null;
  const purchaseCostPct = totalSales > 0 ? (totalPurchases / totalSales) * 100 : null;
  const wasteCostPct = totalSales > 0 ? (totalWaste / totalSales) * 100 : null;

  const cards = [
    { label: `Inventario inicial (${formatDate(initialCount.date)})`, value: formatMoney(initialValue) },
    { label: `Inventario final (${formatDate(finalCount.date)})`, value: formatMoney(finalValue) },
    { label: "Total de compras del periodo", value: formatMoney(totalPurchases) },
    { label: "Total de ventas del periodo", value: formatMoney(totalSales) },
    { label: "Total de mermas del periodo", value: formatMoney(totalWaste) },
    { label: "Costo %", value: costPct !== null ? `${costPct.toFixed(1)}%` : "-" },
    { label: "Costo de compra %", value: purchaseCostPct !== null ? `${purchaseCostPct.toFixed(1)}%` : "-" },
    { label: "Costo de mermas %", value: wasteCostPct !== null ? `${wasteCostPct.toFixed(1)}%` : "-" },
    { label: "Monto total de faltantes", value: `-${formatMoney(audit.totalShortageAmount)}`, negative: true },
    { label: "Monto total de sobrantes", value: `+${formatMoney(audit.totalSurplusAmount)}`, positive: true },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Panel</h1>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="initial" className="text-sm font-medium text-neutral-700">
            Fecha inicial (inventario)
          </label>
          <select
            id="initial"
            name="initial"
            defaultValue={initialCountId}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="final" className="text-sm font-medium text-neutral-700">
            Fecha final (inventario)
          </label>
          <select
            id="final"
            name="final"
            defaultValue={finalCountId}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Ver
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        Solo se pueden elegir fechas con un conteo de inventario capturado.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">{card.label}</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                card.negative ? "text-red-600" : card.positive ? "text-emerald-700" : "text-neutral-900"
              }`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
