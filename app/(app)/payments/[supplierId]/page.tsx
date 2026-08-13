import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatPurchaseFolio } from "@/lib/purchases/folio";
import SupplierPaymentsManager, {
  type LegacyAdvanceRow,
  type FolioRow,
  type OrphanedFolioRow,
} from "./SupplierPaymentsManager";

export default async function SupplierPaymentsPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const user = await requireSucursalContext();

  const [supplier, allSuppliers, purchases, payments] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: supplierId, organizationId: user.organizationId } }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.purchase.findMany({
      where: { sucursalId: user.sucursalId, supplierId },
      select: { folio: true, purchaseDate: true, totalPrice: true },
    }),
    prisma.supplierPayment.findMany({
      where: { sucursalId: user.sucursalId, supplierId },
    }),
  ]);
  if (!supplier) notFound();

  // Un folio puede tener varios abonos (pagos parciales); se suman para saber cuanto se ha
  // cubierto de ese folio en total, y se guarda la fecha del abono mas reciente para mostrarla
  // como "fecha de pago" del folio.
  const abonadoByFolio = new Map<number, number>();
  const lastPaidDateByFolio = new Map<number, Date>();
  for (const payment of payments) {
    if (payment.folio === null) continue;
    abonadoByFolio.set(payment.folio, (abonadoByFolio.get(payment.folio) ?? 0) + Number(payment.amount));
    const current = lastPaidDateByFolio.get(payment.folio);
    if (!current || payment.paidDate > current) {
      lastPaidDateByFolio.set(payment.folio, payment.paidDate);
    }
  }

  const byFolio = new Map<number, { dateValue: number; dateLabel: string; total: number }>();
  for (const purchase of purchases) {
    const existing = byFolio.get(purchase.folio);
    const amount = Number(purchase.totalPrice);
    if (existing) {
      existing.total += amount;
    } else {
      byFolio.set(purchase.folio, {
        dateValue: purchase.purchaseDate.getTime(),
        dateLabel: purchase.purchaseDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
        total: amount,
      });
    }
  }

  const folioRows: FolioRow[] = [...byFolio.entries()]
    .map(([folio, data]) => {
      const abonado = abonadoByFolio.get(folio) ?? 0;
      const lastPaidDate = lastPaidDateByFolio.get(folio) ?? null;
      return {
        folio,
        folioLabel: formatPurchaseFolio(folio),
        dateLabel: data.dateLabel,
        dateValue: data.dateValue,
        total: data.total,
        abonado,
        isPaid: abonado >= data.total - 0.005,
        paidDateLabel: lastPaidDate ? lastPaidDate.toLocaleDateString("es-MX", { timeZone: "UTC" }) : null,
      };
    })
    .sort((a, b) => b.folio - a.folio);

  // Pagos "huerfanos": tienen folio pero ese folio ya no tiene ninguna compra (se elimino la
  // compra sin quitar antes el pago -- ya no se puede prevenir esto para datos viejos, pero se
  // muestran aqui para que se puedan quitar y el saldo del proveedor vuelva a cuadrar).
  const orphanedFolioRows: OrphanedFolioRow[] = [...abonadoByFolio.entries()]
    .filter(([folio]) => !byFolio.has(folio))
    .map(([folio, amount]) => {
      const lastPaidDate = lastPaidDateByFolio.get(folio) ?? null;
      return {
        folio,
        folioLabel: formatPurchaseFolio(folio),
        amount,
        paidDateLabel: lastPaidDate ? lastPaidDate.toLocaleDateString("es-MX", { timeZone: "UTC" }) : null,
      };
    })
    .sort((a, b) => b.folio - a.folio);

  // Abonos antiguos sin folio (de antes de este cambio): ya no se pueden crear nuevos asi, pero
  // se muestran para no esconder dinero que ya se resto del saldo.
  const legacyAdvanceRows: LegacyAdvanceRow[] = payments
    .filter((p) => p.folio === null)
    .map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidDateLabel: p.paidDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
      note: p.note,
    }))
    .sort((a, b) => b.paidDateLabel.localeCompare(a.paidDateLabel));

  const totalPurchased = purchases.reduce((sum, p) => sum + Number(p.totalPrice), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalPurchased - totalPaid;

  return (
    <SupplierPaymentsManager
      supplier={{ id: supplier.id, name: supplier.name }}
      allSuppliers={allSuppliers}
      folioRows={folioRows}
      orphanedFolioRows={orphanedFolioRows}
      legacyAdvanceRows={legacyAdvanceRows}
      totalPurchased={totalPurchased}
      totalPaid={totalPaid}
      balance={balance}
    />
  );
}
