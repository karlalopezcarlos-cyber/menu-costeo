import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { listSuppliersForCapture } from "@/lib/suppliers";
import ProductSupplierTable, { type ProductSupplierRow } from "./ProductSupplierTable";

export default async function ProductSuppliersPage() {
  const user = await requireOrgSession();

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, isProcessed: false },
      orderBy: { name: "asc" },
      include: { category: true, defaultSupplier: { select: { id: true, name: true } } },
    }),
    listSuppliersForCapture(user.organizationId),
  ]);

  // Un proveedor inactivo ya asignado se sigue mostrando como opcion, para no borrarlo sin querer
  // al guardar la pantalla.
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

  const rows: ProductSupplierRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    categoryName: product.category?.name ?? null,
    defaultSupplierId: product.defaultSupplierId,
  }));

  const sinProveedor = rows.filter((r) => !r.defaultSupplierId).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Compras
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Proveedor habitual por producto
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Deja amarrado con quien se pide cada producto. Con esto el pedido sugerido se desglosa
            solo: un pedido por proveedor, con sus datos, listo para mandarle a cada uno.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings/suppliers" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Administrar proveedores
          </Link>
          <Link href="/products" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Volver al catalogo
          </Link>
        </div>
      </div>

      {supplierOptions.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no tienes proveedores dados de alta.{" "}
          <Link href="/settings/suppliers" className="font-medium underline">
            Crealos primero
          </Link>{" "}
          y regresa aqui a asignarlos.
        </p>
      ) : (
        <ProductSupplierTable rows={rows} suppliers={supplierOptions} sinProveedor={sinProveedor} />
      )}
    </div>
  );
}
