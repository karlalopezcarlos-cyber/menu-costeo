import { prisma } from "@/lib/prisma";
import { computeDueInfo } from "@/lib/payments/credit";

/**
 * El saldo de un proveedor es simplemente lo comprado menos lo pagado: cada folio marcado como
 * pagado genera un SupplierPayment por el total de ese folio, y cada adelanto (folio null) resta
 * directo. No hace falta llevar un booleano "pagado" aparte en Purchase.
 *
 * Saldo de todos los proveedores de UNA SUCURSAL, en dos consultas agrupadas (sin N+1). Un
 * proveedor compartido por la organizacion puede tener saldo distinto en cada sucursal, porque sus
 * compras y pagos ya son por sucursal (cada una compra/paga de forma independiente).
 */
export async function computeAllSupplierBalances(
  sucursalId: string,
): Promise<Map<string, { totalPurchased: number; totalPaid: number; balance: number }>> {
  const [purchaseGroups, paymentGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { sucursalId, supplierId: { not: null } },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { sucursalId },
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

/**
 * Folios vencidos y proximo vencimiento por proveedor, para la lista de cuentas por pagar.
 *
 * Un folio cuenta como vencido cuando ya paso su fecha limite (fecha de compra + dias de
 * credito del proveedor) y todavia le falta por abonar. Se resuelve en dos consultas agrupadas,
 * sin recorrer compra por compra.
 */
export async function computeOverdueBySupplier(
  sucursalId: string,
  creditDaysBySupplier: Map<string, number | null>,
): Promise<Map<string, { overdueCount: number; nextDueDays: number | null }>> {
  const [purchaseGroups, paymentGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId", "folio"],
      where: { sucursalId, supplierId: { not: null } },
      _sum: { totalPrice: true },
      _min: { purchaseDate: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId", "folio"],
      where: { sucursalId, folio: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const paidByKey = new Map(
    paymentGroups.map((g) => [`${g.supplierId}:${g.folio}`, Number(g._sum.amount ?? 0)]),
  );

  const result = new Map<string, { overdueCount: number; nextDueDays: number | null }>();
  for (const group of purchaseGroups) {
    const supplierId = group.supplierId as string;
    const creditDays = creditDaysBySupplier.get(supplierId);
    if (creditDays === null || creditDays === undefined) continue;

    const total = Number(group._sum.totalPrice ?? 0);
    const paid = paidByKey.get(`${supplierId}:${group.folio}`) ?? 0;
    if (paid >= total - 0.005) continue; // ya esta cubierto

    const purchaseDate = group._min.purchaseDate;
    if (!purchaseDate) continue;
    const due = computeDueInfo(purchaseDate, creditDays);
    if (!due) continue;

    const current = result.get(supplierId) ?? { overdueCount: 0, nextDueDays: null };
    if (due.daysLeft < 0) {
      current.overdueCount += 1;
    } else if (current.nextDueDays === null || due.daysLeft < current.nextDueDays) {
      current.nextDueDays = due.daysLeft;
    }
    result.set(supplierId, current);
  }
  return result;
}

export type SupplierDailyMovement = {
  supplierId: string;
  /** Dia en formato YYYY-MM-DD, para comparar contra los filtros de fecha sin lios de zona. */
  day: string;
  purchased: number;
  paid: number;
};

/**
 * Movimientos por proveedor y por dia, para que la lista de cuentas por pagar pueda recalcular
 * sus totales en pantalla al cambiar el periodo, sin volver al servidor en cada tecla.
 *
 * Se agrupa por dia (no por movimiento) porque lo unico que necesita la lista son sumas: con un
 * ano de operacion y diez proveedores son unos cuantos cientos de renglones, no miles.
 */
export async function loadSupplierDailyMovements(sucursalId: string): Promise<SupplierDailyMovement[]> {
  const [purchaseGroups, paymentGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["supplierId", "purchaseDate"],
      where: { sucursalId, supplierId: { not: null } },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId", "paidDate"],
      where: { sucursalId },
      _sum: { amount: true },
    }),
  ]);

  const porClave = new Map<string, SupplierDailyMovement>();
  const dia = (d: Date) => d.toISOString().slice(0, 10);

  const acumular = (supplierId: string, day: string, campo: "purchased" | "paid", valor: number) => {
    const clave = `${supplierId}:${day}`;
    const actual = porClave.get(clave) ?? { supplierId, day, purchased: 0, paid: 0 };
    actual[campo] += valor;
    porClave.set(clave, actual);
  };

  for (const g of purchaseGroups) {
    acumular(g.supplierId as string, dia(g.purchaseDate), "purchased", Number(g._sum.totalPrice ?? 0));
  }
  for (const g of paymentGroups) {
    acumular(g.supplierId, dia(g.paidDate), "paid", Number(g._sum.amount ?? 0));
  }

  return [...porClave.values()];
}
