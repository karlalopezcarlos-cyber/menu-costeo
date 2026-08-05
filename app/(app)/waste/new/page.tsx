import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";
import WasteForm from "./WasteForm";

export default async function NewWastePage() {
  const user = await requireSucursalContext();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, baseUnit: true, yieldPercentage: true },
  });
  const productCosts = await getSucursalProductCosts(
    user.sucursalId,
    products.map((p) => p.id),
  );

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
            currentUnitCost: (productCosts.get(p.id) ?? new Decimal(0)).toString(),
            yieldPercentage: p.yieldPercentage.toString(),
          }))}
        />
      )}
    </div>
  );
}
