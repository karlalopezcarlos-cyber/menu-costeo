import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, removeYieldFactor, type UnitValue } from "@/lib/units";
import CleaningForm, { type CleaningProduct } from "./CleaningForm";

export default async function NewCleaningPage() {
  const user = await requireSucursalContext();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      baseUnit: true,
      currentUnitCost: true,
      yieldPercentage: true,
      isProcessed: true,
    },
  });

  const options: CleaningProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseUnit: p.baseUnit as UnitValue,
    baseUnitLabel: UNIT_LABELS[p.baseUnit as UnitValue],
    grossUnitCost: removeYieldFactor(p.currentUnitCost.toString(), p.yieldPercentage.toString()).toString(),
    isProcessed: p.isProcessed,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Transformaciones</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Nueva limpieza</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Cuando habilitas un producto y pierdes peso en el camino: de 1 kg de camaron crudo salen
            800 g de camaron limpio. El sistema calcula la merma y cuanto cuesta el producto limpio.
          </p>
        </div>
        <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
          Volver
        </Link>
      </div>

      <CleaningForm products={options} />
    </div>
  );
}
