import { prisma } from "@/lib/prisma";

/**
 * El saldo de un proveedor es simplemente lo comprado menos lo pagado: cada folio marcado como
 * pagado genera un SupplierPayment por el total de ese folio, y cada adelanto (folio null) resta
 * directo. No hace falta llevar un booleano "pagado" aparte en Purchase.
 *
 * Saldo de todos los proveedores de la organizacion, en dos consultas agrupadas (sin N+1).
 */
export async function computeAllSupplierBalances(
  organizationId: string,
): Promise<Map<string, { totalPurchased: number; totalPaid: number; balance: number }>> {
  const [purchaseGroups, paymentGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { organizationId, supplierId: { not: null } },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { organizationId },
      _sum: { amount: true },
    }),
  ]);

  const purchasedBySupplier = new Map(
    purchaseGroups.map((g) => [g.supplierId as string, Number(g._sum.totalPrice ?? 0)]),
  );
  const paidBySupplier = new Map(paymentGroups.map((g) => [g.supplierId, Number(g._sum.amount ?? 0)]));

  const supplierIds = new Set([...purchasedBySupplier.keys(), ...paidBySupplier.keys()]);
  const result = new Map<string, { totalPurchased: number; totalPaid: number; balance: number }>();
  for (const supplierId of supplierIds) {
    const totalPurchased = purchasedBySupplier.get(supplierId) ?? 0;
    const totalPaid = paidBySupplier.get(supplierId) ?? 0;
    result.set(supplierId, { totalPurchased, totalPaid, balance: totalPurchased - totalPaid });
  }
  return result;
}
