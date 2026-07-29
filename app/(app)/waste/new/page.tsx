import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import type { UnitValue } from "@/lib/units";
import WasteForm from "./WasteForm";

export default async function NewWastePage() {
  const user = await requireOrgSession();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseUnit: true, currentUnitCost: true, yieldPercentage: true },
  });

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Registrar merma</h1>
      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Primero agrega al menos un producto en el catalogo.
        </p>
      ) : (
        <WasteForm
          products={products.map((p) => ({
            ...p,
            baseUnit: p.baseUnit as UnitValue,
            currentUnitCost: p.currentUnitCost.toString(),
            yieldPercentage: p.yieldPercentage.toString(),
          }))}
        />
      )}
    </div>
  );
}
