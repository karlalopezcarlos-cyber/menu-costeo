import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { computeUnitCost, type UnitValue } from "@/lib/units";
import { formatOrderFolio } from "@/lib/orders/folio";
import PurchaseForm, { type PendingOrderOption } from "./PurchaseForm";

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  const { pedido } = await searchParams;
  const user = await requireOrgSession();

  const [products, suppliers, recentPurchases, openOrders] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        yieldPercentage: true,
        presentationUnitLabel: true,
        presentationUnitQty: true,
        presentations: true,
      },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.purchase.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      select: {
        productId: true,
        presentationLabel: true,
        presentationQty: true,
        presentationUnit: true,
        totalPrice: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { organizationId: user.organizationId, status: "OPEN" },
      orderBy: { folio: "desc" },
      include: {
        items: true,
        supplier: { select: { name: true } },
      },
    }),
  ]);

  const pendingOrders: PendingOrderOption[] = openOrders
    .map((order) => ({
      id: order.id,
      folioLabel: formatOrderFolio(order.folio),
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? null,
      items: order.items
        .map((item) => ({
          productId: item.productId,
          presentationLabel: item.presentationLabel,
          pending: Math.max(
            Number(item.quantity) - (item.receivedQuantity != null ? Number(item.receivedQuantity) : 0),
            0,
          ),
        }))
        .filter((item) => item.pending > 0),
    }))
    .filter((order) => order.items.length > 0);

  const baseUnitByProductId = new Map(products.map((p) => [p.id, p.baseUnit as UnitValue]));

  const lastPurchaseByProduct: Record<
    string,
    { label: string; qty: string; unit: UnitValue; totalPrice: string; unitCostBase: string | null }
  > = {};
  for (const purchase of recentPurchases) {
    if (lastPurchaseByProduct[purchase.productId]) continue;
    const baseUnit = baseUnitByProductId.get(purchase.productId);
    let unitCostBase: string | null = null;
    if (baseUnit) {
      try {
        unitCostBase = computeUnitCost(
          purchase.totalPrice,
          purchase.presentationQty,
          purchase.presentationUnit as UnitValue,
          baseUnit,
        ).toString();
      } catch {
        unitCostBase = null;
      }
    }
    lastPurchaseByProduct[purchase.productId] = {
      label: purchase.presentationLabel,
      qty: purchase.presentationQty.toString(),
      unit: purchase.presentationUnit as UnitValue,
      totalPrice: purchase.totalPrice.toString(),
      unitCostBase,
    };
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Registrar compra</h1>
      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Primero agrega al menos un producto en el catalogo.
        </p>
      ) : (
        <PurchaseForm
          products={products.map((p) => ({
            ...p,
            baseUnit: p.baseUnit as UnitValue,
            yieldPercentage: p.yieldPercentage.toString(),
            presentationUnitQty: p.presentationUnitQty ? p.presentationUnitQty.toString() : null,
            presentations: p.presentations.map((pres) => ({
              id: pres.id,
              label: pres.label,
              quantity: pres.quantity.toString(),
              unit: pres.unit as UnitValue,
            })),
          }))}
          suppliers={suppliers}
          lastPurchaseByProduct={lastPurchaseByProduct}
          pendingOrders={pendingOrders}
          initialPedidoId={pedido ?? ""}
        />
      )}
    </div>
  );
}
