import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getTheoreticalStock } from "@/lib/audit";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { listSuppliersForCapture } from "@/lib/suppliers";
import ShortfallTable, { type ShortfallRow } from "./ShortfallTable";

export default async function NewOrderPage() {
  const user = await requireSucursalContext();

  const [products, stock, openOrderItems, recentPurchases, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: {
        organizationId: user.organizationId,
        archivedAt: null,
        isProcessed: false,
        targetStock: { gt: 0 },
        // Un pedido sugerido de renta no le sirve a nadie.
        OR: [{ categoryId: null }, { category: { isExpense: false } }],
      },
      orderBy: { name: "asc" },
      include: { category: true, presentations: true, defaultSupplier: { select: { id: true, name: true } } },
    }),
    getTheoreticalStock(user.organizationId, user.sucursalId),
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { sucursalId: user.sucursalId, status: "OPEN" } },
      select: { productId: true },
    }),
    prisma.purchase.findMany({
      where: { sucursalId: user.sucursalId },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      select: { productId: true, presentationLabel: true },
    }),
    listSuppliersForCapture(user.organizationId),
  ]);

  // Si un producto quedo amarrado a un proveedor que luego se desactivo, ese proveedor se sigue
  // ofreciendo en el selector (marcado): de otra forma el renglon se veria "sin proveedor" sin
  // que nadie lo haya quitado.
  const asignadosInactivos = new Map<string, string>();
  for (const product of products) {
    if (!product.defaultSupplier) continue;
    if (suppliers.some((s) => s.id === product.defaultSupplier!.id)) continue;
    asignadosInactivos.set(product.defaultSupplier.id, product.defaultSupplier.name);
  }
  const supplierOptions = [
    ...suppliers,
    ...[...asignadosInactivos].map(([id, name]) => ({ id, name: `${name} (inactivo)` })),
  ];

  const productIdsInOpenOrder = new Set(openOrderItems.map((i) => i.productId));
  const lastPresentationByProductId = new Map<string, string>();
  for (const purchase of recentPurchases) {
    if (lastPresentationByProductId.has(purchase.productId)) continue;
    lastPresentationByProductId.set(purchase.productId, purchase.presentationLabel);
  }

  const rows: ShortfallRow[] = products
    .map((product) => {
      const currentStock = stock.productQty.get(product.id)?.toNumber() ?? 0;
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
        defaultSupplierId: product.defaultSupplierId,
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pedido sugerido</h1>
          <p className="text-sm text-neutral-500">
            Comparamos tu stock objetivo contra el inventario teorico a hoy
            {stock.asOfLabel ? ` (a partir del conteo del ${stock.asOfLabel})` : ""}. Se crea un
            pedido por proveedor, para mandarle a cada uno nada mas lo suyo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/products/suppliers" className="text-sm text-neutral-500 hover:underline">
            Proveedor por producto
          </Link>
          <Link href="/orders/stock" className="text-sm text-neutral-500 hover:underline">
            Configurar stock
          </Link>
          <Link href="/orders" className="text-sm text-neutral-500 hover:underline">
            Ver pedidos
          </Link>
        </div>
      </div>

      {!stock.hasBaseline && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no tienes ningun conteo de inventario: el stock actual se asume en 0 para todos
          los productos.
        </p>
      )}

      <ShortfallTable rows={rows} suppliers={supplierOptions} />
    </div>
  );
}
