import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadTransformationProducts } from "@/lib/transformation-options";
import TransformationForm from "./TransformationForm";

export default async function NewTransformationPage() {
  const user = await requireSucursalContext();
  const [products, templates] = await Promise.all([
    loadTransformationProducts(user.organizationId, user.sucursalId),
    prisma.transformationTemplate.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      include: { outputs: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Nueva transformacion
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Entra un producto y salen otros: limpiar camaron, porcionarlo, o las dos cosas en la
            misma tanda. Cada transformacion vale por si sola — puedes porcionar el crudo directo
            o el que ya limpiaste, segun lo que hayas hecho hoy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/portioning/templates"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Plantillas
          </Link>
          <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Volver
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no tienes productos en el catalogo.
        </p>
      ) : (
        <TransformationForm
          products={products}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            sourceProductId: t.sourceProductId,
            outputs: t.outputs.map((o) => ({
              productId: o.productId,
              refQtyPerUnit: o.refQtyPerUnit ? o.refQtyPerUnit.toString() : "",
            })),
          }))}
        />
      )}
    </div>
  );
}
