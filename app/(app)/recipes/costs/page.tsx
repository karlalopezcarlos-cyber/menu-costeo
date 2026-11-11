import Link from "next/link";
import { requireSucursalContext } from "@/lib/tenant";
import ImportRecipeCostsForm from "./ImportRecipeCostsForm";

export default async function ImportRecipeCostsPage() {
  await requireSucursalContext();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Recetas
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Costos por platillo
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Para operar sin recetas capturadas: pon lo que te cuesta cada platillo y el Estado de
            Resultados trabaja con eso. En cuanto un platillo tenga su receta completa y sus
            insumos comprados, el costo real toma el lugar del capturado, solo.
          </p>
        </div>
        <Link
          href="/recipes"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver a recetas
        </Link>
      </div>

      <ImportRecipeCostsForm />
    </div>
  );
}
