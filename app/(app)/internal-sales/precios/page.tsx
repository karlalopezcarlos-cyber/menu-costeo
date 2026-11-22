import Link from "next/link";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getSucursalProductCosts, loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import PreciosTraspasoTable, { type PrecioRow } from "./PreciosTraspasoTable";

/**
 * Captura de precios de traspaso de la sucursal activa.
 *
 * El precio es por sucursal que vende, asi que esta pantalla siempre habla de la sucursal en la
 * que estas parada: si cambias de sucursal arriba, cambian los precios.
 *
 * Se listan los productos que esta sucursal tiene costeados y sus subrecetas. Un PLU (platillo
 * de menu) no entra: eso se le vende al cliente, no a otra sucursal.
 */
export default async function PreciosTraspasoPage() {
  const user = await requireSucursalContext();

  const [sucursal, productos, subrecetas, precios] = await Promise.all([
    prisma.sucursal.findUnique({ where: { id: user.sucursalId }, select: { name: true } }),
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.recipe.findMany({
      where: {
        sucursalId: user.sucursalId,
        archivedAt: null,
        isMenuItem: false,
        isPortion: false,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldQty: true, yieldUnit: true },
    }),
    prisma.internalTransferPrice.findMany({
      where: { sucursalId: user.sucursalId },
      select: { productId: true, recipeId: true, price: true },
    }),
  ]);

  const precioPorProducto = new Map<string, number>();
  const precioPorReceta = new Map<string, number>();
  for (const p of precios) {
    if (p.productId) precioPorProducto.set(p.productId, Number(p.price));
    else if (p.recipeId) precioPorReceta.set(p.recipeId, Number(p.price));
  }

  const costos = await getSucursalProductCosts(
    user.sucursalId,
    productos.map((p) => p.id),
  );

  // El costo unitario de una subreceta es su costo total entre su rendimiento, igual que lo
  // calcula la requisicion al congelarlo.
  const graph = subrecetas.length > 0 ? await loadOrgRecipeGraph(user.sucursalId) : null;
  const memo = new Map<string, Decimal>();

  const filasProductos: PrecioRow[] = productos.map((p) => {
    const costo = costos.get(p.id);
    return {
      tipo: "product",
      id: p.id,
      nombre: p.name,
      unidad: UNIT_LABELS[p.baseUnit as UnitValue],
      costo: costo ? costo.toNumber() : null,
      precio: precioPorProducto.get(p.id) ?? null,
    };
  });

  const filasSubrecetas: PrecioRow[] = subrecetas.map((r) => {
    let costo: number | null = null;
    if (graph && !r.yieldQty.isZero()) {
      try {
        costo = getRecipeCost(r.id, graph, memo).dividedBy(r.yieldQty).toNumber();
      } catch {
        costo = null;
      }
    }
    return {
      tipo: "recipe",
      id: r.id,
      nombre: r.name,
      unidad: UNIT_LABELS[r.yieldUnit as UnitValue],
      costo,
      precio: precioPorReceta.get(r.id) ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/internal-sales" className="text-sm text-neutral-500 hover:underline">
          ← Ventas internas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
          Precios de traspaso
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          A cuanto <strong>{sucursal?.name ?? "esta sucursal"}</strong> le vende cada cosa a las
          demas sucursales. Un renglon sin precio se sigue traspasando a costo y no genera ingreso.
        </p>
      </div>

      <PreciosTraspasoTable productos={filasProductos} subrecetas={filasSubrecetas} />
    </div>
  );
}
