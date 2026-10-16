import PaymentsSupplierList, { type SupplierBalanceRow } from "./PaymentsSupplierList";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import {
  computeAllSupplierBalances,
  computeOverdueBySupplier,
  loadSupplierDailyMovements,
} from "@/lib/payments";

export default async function PaymentsPage() {
  const user = await requireSucursalContext();

  const [suppliers, balances] = await Promise.all([
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, creditDays: true },
    }),
    computeAllSupplierBalances(user.sucursalId),
  ]);

  const movements = await loadSupplierDailyMovements(user.sucursalId);

  // El periodo por omision es el mes en curso. Se calcula en el servidor para que el valor
  // inicial del filtro sea el mismo en el HTML y en el navegador.
  const hoy = new Date();
  const primerDiaDelMes = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const hoyValor = hoy.toISOString().slice(0, 10);

  const overdue = await computeOverdueBySupplier(
    user.sucursalId,
    new Map(suppliers.map((s) => [s.id, s.creditDays])),
  );

  const rows: SupplierBalanceRow[] = suppliers.map((s) => {
    const balance = balances.get(s.id);
    const credito = overdue.get(s.id);
    return {
      id: s.id,
      name: s.name,
      totalPurchased: balance?.totalPurchased ?? 0,
      totalPaid: balance?.totalPaid ?? 0,
      balance: balance?.balance ?? 0,
      creditDays: s.creditDays,
      overdueCount: credito?.overdueCount ?? 0,
      nextDueDays: credito?.nextDueDays ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pagos a proveedores</h1>
      <PaymentsSupplierList
        rows={rows}
        movements={movements}
        defaultFrom={primerDiaDelMes}
        defaultTo={hoyValor}
      />
    </div>
  );
}
