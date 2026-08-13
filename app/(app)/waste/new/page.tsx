import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";
import WasteForm from "./WasteForm";

export default async function NewWastePage() {
  const user = await requireSucursalContext();

  const [products, recipes, graph] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true, yieldPercentage: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldQty: true, yieldUnit: true, isMenuItem: true },
    }),
    loadOrgRecipeGraph(user.sucursalId),
  ]);
  const productCosts = await getSucursalProductCosts(
    user.sucursalId,
    products.map((p) => p.id),
  );
  const costMemo = new Map();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Registrar merma</h1>
      {products.length === 0 && recipes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Primero agrega al menos un producto, subreceta o receta de menu en el catalogo.
        </p>
      ) : (
        <WasteForm
          products={products.map((p) => ({
            ...p,
            baseUnit: p.baseUnit as UnitValue,
            currentUnitCost: (productCosts.get(p.id) ?? new Decimal(0)).toString(),
            yieldPercentage: p.yieldPercentage.toString(),
          }))}
          subRecipes={recipes.map((r) => {
            let unitCost = 0;
            if (!r.yieldQty.isZero()) {
              try {
                unitCost = getRecipeCost(r.id, graph, costMemo).dividedBy(r.yieldQty).toNumber();
              } catch {
                unitCost = 0;
              }
            }
            return {
              id: r.id,
              name: r.name,
              yieldUnit: r.yieldUnit as UnitValue,
              isMenuItem: r.isMenuItem,
              unitCost,
            };
          })}
        />
      )}
    </div>
  );
}
