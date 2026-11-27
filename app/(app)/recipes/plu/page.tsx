import Link from "next/link";
import { requireSucursalContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import ImportPluForm from "./ImportPluForm";

export default async function ImportPluPage() {
  const user = await requireSucursalContext();
  const sucursal = await prisma.sucursal.findUnique({
    where: { id: user.sucursalId },
    select: { name: true },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Recetas
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Carga masiva de PLU
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Para montar el menu de un jalon: nombre, precio y categoria de cada platillo. Entran
            con rendimiento 1 PZA, sin receta y sin costo; los ingredientes se les capturan
            despues, uno por uno o con la carga de costos.
          </p>
        </div>
        <Link
          href="/recipes"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver a recetas
        </Link>
      </div>

      <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        Los PLU se dan de alta <b>solo en {sucursal?.name ?? "la sucursal activa"}</b>, la sucursal
        en la que estas ahora. No se copian a las demas: si los quieres alla, cambia de sucursal y
        sube el mismo archivo.
      </p>

      <ImportPluForm sucursalName={sucursal?.name ?? "esta sucursal"} />
    </div>
  );
}
