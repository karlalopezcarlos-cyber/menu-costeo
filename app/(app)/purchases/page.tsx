import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import PurchasesTable, { type PurchaseRow } from "./PurchasesTable";
import { toPurchaseRow } from "./purchase-rows";

export default async function PurchasesPage() {
  const user = await requireOrgSession();

  const [purchases, openOrderItems] = await Promise.all([
    prisma.purchase.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { purchaseDate: "desc" },
      take: 100,
      include: { product: true, supplier: true },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { organizationId: user.organizationId, status: "OPEN" } },
      select: { productId: true, quantity: true, receivedQuantity: true },
    }),
  ]);

  // Productos que todavia tienen saldo pendiente en algun pedido abierto (independientemente de
  // si la compra que se esta mostrando fue la que dejo ese faltante).
  const productIdsWithPending = new Set(
    openOrderItems
      .filter((item) => {
        const received = item.receivedQuantity != null ? Number(item.receivedQuantity) : 0;
        return Number(item.quantity) - received > 0;
      })
      .map((item) => item.productId),
  );

  const rows: PurchaseRow[] = purchases.map((purchase) =>
    toPurchaseRow(purchase, productIdsWithPending.has(purchase.productId)),
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

      <PurchasesTable rows={rows} />
    </div>
  );
}
