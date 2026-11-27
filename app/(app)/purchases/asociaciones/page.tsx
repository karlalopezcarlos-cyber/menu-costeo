import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { cargarCatalogoDeCompras } from "@/lib/compras/catalogo";
import PurchasesShell from "../PurchasesShell";
import AsociacionesTable, { type FilaAsociacion } from "./AsociacionesTable";

export default async function AsociacionesPage() {
  const user = await requireSucursalContext();

  const [asociaciones, { productos }] = await Promise.all([
    prisma.supplierItemMapping.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ vecesUsada: "desc" }, { descripcion: "asc" }],
      select: {
        id: true,
        descripcion: true,
        unidadDocumento: true,
        factor: true,
        presentationUnit: true,
        presentationLabel: true,
        vecesUsada: true,
        lastUsedAt: true,
        supplier: { select: { name: true } },
        product: { select: { id: true, name: true, baseUnit: true } },
      },
    }),
    cargarCatalogoDeCompras(user.organizationId),
  ]);

  const filas: FilaAsociacion[] = asociaciones.map((a) => ({
    id: a.id,
    descripcion: a.descripcion,
    unidadDocumento: a.unidadDocumento,
    proveedor: a.supplier?.name ?? null,
    productId: a.product.id,
    productoNombre: a.product.name,
    factor: a.factor.toString(),
    presentationUnit: a.presentationUnit,
    presentationLabel: a.presentationLabel,
    vecesUsada: a.vecesUsada,
    ultimoUso: a.lastUsedAt ? a.lastUsedAt.toISOString().slice(0, 10) : null,
  }));

  return (
    <PurchasesShell tab="asociaciones">
      <div className="space-y-4">
        <p className="max-w-3xl text-sm text-neutral-500">
          Cada vez que emparejas un renglon de un XML o de una foto con un producto del catalogo,
          la app lo recuerda aqui. La siguiente factura con ese mismo texto se llena sola. Si
          alguna quedo mal, corrigela o borrala: mientras este aqui se aplica callada en cada
          compra que llegue.
        </p>
        <AsociacionesTable filas={filas} productos={productos} />
      </div>
    </PurchasesShell>
  );
}
