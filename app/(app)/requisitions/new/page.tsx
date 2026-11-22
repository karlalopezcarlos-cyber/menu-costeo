import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";
import { getInternalProductPrices, getInternalRecipePrices } from "@/lib/internal-prices";
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
      select: { id: true, name: true, yieldUnit: true, yieldQty: true },
    }),
    prisma.sucursal.findMany({
      where: { organizationId: user.organizationId, isActive: true, id: { not: user.sucursalId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadOrgRecipeGraph(user.sucursalId),
  ]);

  const [productCosts, productPrices, recipePrices] = await Promise.all([
    getSucursalProductCosts(
      user.sucursalId,
      products.map((p) => p.id),
    ),
    getInternalProductPrices(
      user.sucursalId,
      products.map((p) => p.id),
    ),
    getInternalRecipePrices(
      user.sucursalId,
      subRecipes.map((r) => r.id),
    ),
  ]);
  const costMemo = new Map();

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Nueva requisicion</h1>
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
            unitPrice: productPrices.get(p.id)?.price.toNumber() ?? null,
            ivaRate: productPrices.get(p.id)?.ivaRate ?? 0,
          }))}
          subRecipes={subRecipes.map((r) => {
            // getRecipeCost devuelve lo que cuesta el RENDIMIENTO COMPLETO, no el litro: una
            // subreceta que rinde 4.5 LT y cuesta $309.90 el lote vale $68.87 el litro. Hay que
            // dividir, que es lo que hace la accion al congelar el costo. Sin esta division la
            // pantalla enseñaba el costo del lote como si fuera el unitario.
            let unitCost = 0;
            try {
              unitCost = r.yieldQty.isZero()
                ? 0
                : getRecipeCost(r.id, graph, costMemo).dividedBy(r.yieldQty).toNumber();
            } catch {
              unitCost = 0;
            }
            return {
              id: r.id,
              name: r.name,
              yieldUnit: r.yieldUnit as UnitValue,
              unitCost,
              unitPrice: recipePrices.get(r.id)?.price.toNumber() ?? null,
              ivaRate: recipePrices.get(r.id)?.ivaRate ?? 0,
            };
          })}
          sucursales={sucursales}
        />
      )}
    </div>
  );
}
