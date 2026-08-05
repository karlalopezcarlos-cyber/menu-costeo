import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import StockTargetTable, { type StockRow } from "./StockTargetTable";

export default async function StockTargetPage() {
  const user = await requireSucursalContext();

  const [products, latestCount] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { category: true },
    }),
    prisma.inventoryCount.findFirst({
      where: { sucursalId: user.sucursalId },
      orderBy: { date: "desc" },
      include: { items: true },
    }),
  ]);

  const currentQtyByProductId = new Map(
    (latestCount?.items ?? [])
      .filter((i) => i.productId)
      .map((i) => [i.productId as string, Number(i.quantity)]),
  );

  const rows: StockRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    categoryName: product.category?.name ?? null,
    unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
    currentStock: currentQtyByProductId.get(product.id) ?? null,
    targetStock: Number(product.targetStock),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Configurar stock objetivo</h1>
          <p className="text-sm text-neutral-500">
            Define cuanto deberias tener de cada producto (par level). La seccion de pedidos
            sugeridos calcula lo que falta comparando esto contra tu ultimo conteo de inventario.
          </p>
        </div>
        <Link href="/orders" className="text-sm text-neutral-500 hover:underline">
          Volver a pedidos
        </Link>
      </div>

      {latestCount && (
        <p className="text-xs text-neutral-500">
          Stock actual de referencia tomado del conteo del{" "}
          {latestCount.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}.
        </p>
      )}

      <StockTargetTable rows={rows} />
    </div>
  );
}
