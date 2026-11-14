import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import ImportProductCostsForm from "./ImportProductCostsForm";

export default async function ImportProductCostsPage() {
  const user = await requireSucursalContext();
  const sucursal = await prisma.sucursal.findUniqueOrThrow({
    where: { id: user.sucursalId },
    select: { name: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Productos
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Costos de esta sucursal
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Para la sucursal que abre y todavia no tiene compras capturadas, pero ya necesita
            costear sus recetas con sus propios precios. Lo que cargues aqui vive solo en esta
            sucursal: el catalogo de productos es de toda la organizacion, pero su costo no.
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            En cuanto esta sucursal capture una compra del producto, esa compra manda y el costo
            cargado se queda de respaldo. No hay que borrarlo ni volver a subir nada.
          </p>
        </div>
        <Link
          href="/products"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver al catalogo
        </Link>
      </div>

      <ImportProductCostsForm sucursalName={sucursal.name} />
    </div>
  );
}
