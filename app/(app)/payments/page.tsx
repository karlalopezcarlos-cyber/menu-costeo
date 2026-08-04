import PaymentsSupplierList, { type SupplierBalanceRow } from "./PaymentsSupplierList";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { computeAllSupplierBalances } from "@/lib/payments";

export default async function PaymentsPage() {
  const user = await requireOrgSession();

  const [suppliers, balances] = await Promise.all([
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    computeAllSupplierBalances(user.organizationId),
  ]);

  const rows: SupplierBalanceRow[] = suppliers.map((s) => {
    const balance = balances.get(s.id);
    return {
      id: s.id,
      name: s.name,
      totalPurchased: balance?.totalPurchased ?? 0,
      totalPaid: balance?.totalPaid ?? 0,
      balance: balance?.balance ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Pagos a proveedores</h1>
      <PaymentsSupplierList rows={rows} />
    </div>
  );
}
