import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import ProductsTable, { type ProductRow } from "./ProductsTable";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showArchived = view === "archived";
  const user = await requireOrgSession();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: showArchived ? { not: null } : null },
    orderBy: { name: "asc" },
    include: { category: true },
  });

  const rows: ProductRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    categoryName: product.category?.name ?? null,
    baseUnitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
    yieldPercentage: Number(product.yieldPercentage),
    currentUnitCost: product.currentUnitCostUpdatedAt ? Number(product.currentUnitCost) : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {showArchived ? "Productos archivados" : "Catalogo de productos"}
        </h1>
        <div className="flex items-center gap-3">
          {showArchived ? (
            <Link href="/products" className="text-sm text-neutral-500 hover:underline">
              Ver activos
            </Link>
          ) : (
            <Link href="/products?view=archived" className="text-sm text-neutral-500 hover:underline">
              Ver archivados
            </Link>
          )}
          <a
            href={showArchived ? "/api/export/products?view=archived" : "/api/export/products"}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar a Excel
          </a>
          {!showArchived && (
            <Link
              href="/products/new"
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Agregar producto
            </Link>
          )}
        </div>
      </div>

      <ProductsTable rows={rows} showArchived={showArchived} />
    </div>
  );
}
