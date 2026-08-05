import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import ShortfallTable, { type ShortfallRow } from "./ShortfallTable";

export default async function NewOrderPage() {
  const user = await requireSucursalContext();

  const [products, latestCount, openOrderItems, recentPurchases, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, targetStock: { gt: 0 } },
      orderBy: { name: "asc" },
      include: { category: true, presentations: true },
    }),
    prisma.inventoryCount.findFirst({
      where: { sucursalId: user.sucursalId },
      orderBy: { date: "desc" },
      include: { items: true },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { sucursalId: user.sucursalId, status: "OPEN" } },
      select: { productId: true },
    }),
    prisma.purchase.findMany({
      where: { sucursalId: user.sucursalId },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      select: { productId: true, presentationLabel: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const currentQtyByProductId = new Map(
    (latestCount?.items ?? [])
      .filter((i) => i.productId)
      .map((i) => [i.productId as string, Number(i.quantity)]),
  );
  const productIdsInOpenOrder = new Set(openOrderItems.map((i) => i.productId));
  const lastPresentationByProductId = new Map<string, string>();
  for (const purchase of recentPurchases) {
    if (lastPresentationByProductId.has(purchase.productId)) continue;
    lastPresentationByProductId.set(purchase.productId, purchase.presentationLabel);
  }

  const rows: ShortfallRow[] = products
    .map((product) => {
      const currentStock = currentQtyByProductId.get(product.id) ?? 0;
      const targetStock = Number(product.targetStock);
      const shortfall = Math.max(targetStock - currentStock, 0);
      return {
        id: product.id,
        name: product.name,
        categoryName: product.category?.name ?? null,
        baseUnit: product.baseUnit as UnitValue,
        unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
        currentStock,
        targetStock,
        shortfall,
        alreadyInOpenOrder: productIdsInOpenOrder.has(product.id),
        defaultPresentation:
          lastPresentationByProductId.get(product.id) ?? UNIT_LABELS[product.baseUnit as UnitValue],
        presentations: [
          ...(product.presentationUnitLabel && product.presentationUnitQty
            ? [
                {
                  id: "legacy",
                  label: product.presentationUnitLabel,
                  quantity: product.presentationUnitQty.toString(),
                  unit: product.baseUnit as UnitValue,
                },
              ]
            : []),
          ...product.presentations.map((p) => ({
            id: p.id,
            label: p.label,
            quantity: p.quantity.toString(),
            unit: p.unit as UnitValue,
          })),
        ],
      };
    })
    .filter((row) => row.shortfall > 0 || row.alreadyInOpenOrder);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Pedido sugerido</h1>
          <p className="text-sm text-neutral-500">
            Comparamos tu stock objetivo contra el ultimo conteo de inventario
            {latestCount ? ` (${latestCount.date.toLocaleDateString("es-MX", { timeZone: "UTC" })})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/orders/stock" className="text-sm text-neutral-500 hover:underline">
            Configurar stock
          </Link>
          <Link href="/orders" className="text-sm text-neutral-500 hover:underline">
            Ver pedidos
          </Link>
        </div>
      </div>

      {!latestCount && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no tienes ningun conteo de inventario: el stock actual se asume en 0 para todos
          los productos.
        </p>
      )}

      <ShortfallTable rows={rows} suppliers={suppliers} />
    </div>
  );
}
