import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { type UnitValue } from "@/lib/units";
import PortioningForm, { type ProductOption, type PortionRecipeOption } from "./PortioningForm";

export default async function NewPortioningPage() {
  const user = await requireSucursalContext();

  const [products, portionRecipes] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, currentUnitCost: true, yieldPercentage: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, isPortion: true, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldQty: true, yieldUnit: true },
    }),
  ]);

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseUnit: p.baseUnit as UnitValue,
    currentUnitCost: p.currentUnitCost.toString(),
    yieldPercentage: p.yieldPercentage.toString(),
  }));

  const recipeOptions: PortionRecipeOption[] = portionRecipes.map((r) => ({
    id: r.id,
    name: r.name,
    yieldQty: r.yieldQty.toString(),
    yieldUnit: r.yieldUnit as UnitValue,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Nuevo porcionamiento</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Captura con cuanto producto empezaste y cuantas porciones salieron. El sistema calcula la
            merma real y lo que de verdad cuesta cada porcion.
          </p>
        </div>
        <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
          Volver
        </Link>
      </div>

      <PortioningForm products={productOptions} portionRecipes={recipeOptions} />
    </div>
  );
}
