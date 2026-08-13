import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";
import RequisicionForm from "./RequisicionForm";

export default async function NewRequisicionPage() {
  const user = await requireSucursalContext();

  const [products, subRecipes, sucursales, graph] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldUnit: true },
    }),
    prisma.sucursal.findMany({
      where: { organizationId: user.organizationId, isActive: true, id: { not: user.sucursalId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
      <h1 className="text-2xl font-semibold text-neutral-900">Nueva requisicion</h1>
      {sucursales.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No hay otra sucursal activa a la cual enviar productos. Configura otra en Configuracion &gt;
          Sucursales.
        </p>
      ) : products.length === 0 && subRecipes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Primero agrega al menos un producto o subreceta en el catalogo.
        </p>
      ) : (
        <RequisicionForm
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            baseUnit: p.baseUnit as UnitValue,
            unitCost: productCosts.get(p.id)?.toNumber() ?? 0,
          }))}
          subRecipes={subRecipes.map((r) => {
            let unitCost = 0;
            try {
              unitCost = getRecipeCost(r.id, graph, costMemo).toNumber();
            } catch {
              unitCost = 0;
            }
            return {
              id: r.id,
              name: r.name,
              yieldUnit: r.yieldUnit as UnitValue,
              unitCost,
            };
          })}
          sucursales={sucursales}
        />
      )}
    </div>
  );
}
