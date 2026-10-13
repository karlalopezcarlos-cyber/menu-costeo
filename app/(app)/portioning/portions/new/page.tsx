import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { type UnitValue } from "@/lib/units";
import PortionForm, { type ProductOption } from "./PortionForm";

export default async function NewPortionPage() {
  const user = await requireSucursalContext();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseUnit: true },
  });

  const options: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseUnit: p.baseUnit as UnitValue,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Porcionamiento</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Nueva porcion</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Define una porcion que sale de un producto a granel: cuanto lleva y que mas se le agrega.
          </p>
        </div>
        <Link
          href="/portioning/portions"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver
        </Link>
      </div>

      <PortionForm products={options} />
    </div>
  );
}
