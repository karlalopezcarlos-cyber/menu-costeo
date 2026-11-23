import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  getRecipeCost,
  getSucursalProductCosts,
  loadOrgRecipeGraph,
  type RecipeGraph,
} from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";

/** Un ingrediente de la propuesta, ya costeado. */
export type RenglonCosteado = {
  id: string;
  tipo: "producto" | "subreceta";
  nombre: string;
  quantity: number;
  unitLabel: string;
  /** Costo de una unidad de las capturadas (de un gramo si se capturo en gramos). */
  unitCost: number | null;
  /** unitCost x cantidad. null cuando no se pudo costear. */
  lineCost: number | null;
  /** Por que no se pudo costear, cuando no se pudo. */
  problema: string | null;
};

export type CosteoDeLaPropuesta = {
  renglones: RenglonCosteado[];
  /** Costo del rendimiento completo. */
  costoTotal: number;
  /** Costo de una unidad del rendimiento: el costo de una copa, no el de la jarra. */
  costoUnitario: number;
  /** Cuantos ingredientes no se pudieron costear. Con uno solo, el total ya miente. */
  sinCostear: number;
  /** Margen contra el precio propuesto. null si todavia no hay precio. */
  precio: number | null;
  utilidad: number | null;
  /** Costo como por ciento del precio: el "food cost" del platillo. */
  costoPct: number | null;
  margenPct: number | null;
};

type ItemCosteable = {
  id: string;
  productId: string | null;
  subRecipeId: string | null;
  quantity: Decimal;
  unit: string;
  product: { name: string; baseUnit: string } | null;
  subRecipe: { name: string; yieldUnit: string } | null;
};

/**
 * Costo de un ingrediente, por unidad de las capturadas.
 *
 * Es la misma conversion que usa la pantalla de recetas, a proposito: una propuesta que se
 * costeara con otra regla daria un numero distinto al de la receta que nace de ella, y la
 * diferencia aparecería justo el dia que se autoriza.
 */
function costoUnitarioDe(
  item: ItemCosteable,
  graph: RecipeGraph,
  costosDeProducto: Map<string, Decimal>,
  memo: Map<string, Decimal>,
): { costo: Decimal | null; problema: string | null } {
  try {
    if (item.productId && item.product) {
      const costo = costosDeProducto.get(item.productId);
      if (!costo || costo.isZero()) {
        return { costo: null, problema: "Este producto no tiene costo en esta sucursal" };
      }
      const porUnidad = convertQty(1, item.unit as UnitValue, item.product.baseUnit as UnitValue);
      return { costo: porUnidad.times(costo), problema: null };
    }
    if (item.subRecipeId && item.subRecipe) {
      const nodo = graph.recipes.get(item.subRecipeId);
      if (!nodo) return { costo: null, problema: "La subreceta ya no existe" };
      if (nodo.yieldQty.isZero()) {
        return { costo: null, problema: "La subreceta tiene rendimiento cero" };
      }
      // getRecipeCost devuelve el costo del RENDIMIENTO COMPLETO, no el de una unidad.
      const costoDelLote = getRecipeCost(item.subRecipeId, graph, memo);
      const porUnidad = convertQty(1, item.unit as UnitValue, item.subRecipe.yieldUnit as UnitValue);
      return { costo: porUnidad.times(costoDelLote.dividedBy(nodo.yieldQty)), problema: null };
    }
  } catch {
    return { costo: null, problema: "No se pudo convertir la unidad" };
  }
  return { costo: null, problema: "Ingrediente sin producto ni subreceta" };
}

/**
 * Costea una propuesta completa.
 *
 * Los ingredientes apuntan al catalogo real, asi que el costo sale de los precios vigentes de
 * la sucursal: una propuesta guardada hace tres meses se recostea sola al abrirla. Eso es lo
 * que se quiere -saber si el coctel sigue siendo rentable hoy- y por eso no se congela nada.
 */
export async function costearPropuesta(
  sucursalId: string,
  propuesta: {
    yieldQty: Decimal;
    sellingPrice: Decimal | null;
    items: ItemCosteable[];
  },
): Promise<CosteoDeLaPropuesta> {
  const productIds = propuesta.items
    .map((i) => i.productId)
    .filter((id): id is string => id !== null);

  // El grafo se carga desde las recetas de la sucursal (es lo que necesita una subreceta para
  // costearse), pero sus costos de producto solo cubren los que ya aparecen en alguna receta.
  // Un ingrediente que se estrena en esta propuesta no estaria ahi, asi que se consultan aparte.
  const [graph, costosDeProducto] = await Promise.all([
    loadOrgRecipeGraph(sucursalId),
    productIds.length > 0 ? getSucursalProductCosts(sucursalId, productIds) : new Map(),
  ]);

  const memo = new Map<string, Decimal>();
  const renglones: RenglonCosteado[] = [];
  let costoTotal = new Decimal(0);
  let sinCostear = 0;

  for (const item of propuesta.items) {
    const { costo, problema } = costoUnitarioDe(item, graph, costosDeProducto, memo);
    const linea = costo === null ? null : costo.times(item.quantity);
    if (linea === null) sinCostear += 1;
    else costoTotal = costoTotal.plus(linea);

    renglones.push({
      id: item.id,
      tipo: item.productId ? "producto" : "subreceta",
      nombre: item.product?.name ?? item.subRecipe?.name ?? "(sin nombre)",
      quantity: item.quantity.toNumber(),
      unitLabel: UNIT_LABELS[item.unit as UnitValue] ?? item.unit,
      unitCost: costo === null ? null : costo.toNumber(),
      lineCost: linea === null ? null : linea.toNumber(),
      problema,
    });
  }

  const total = costoTotal.toNumber();
  const costoUnitario = propuesta.yieldQty.isZero()
    ? 0
    : costoTotal.dividedBy(propuesta.yieldQty).toNumber();

  const precio = propuesta.sellingPrice === null ? null : Number(propuesta.sellingPrice);
  // El margen se mide contra el costo UNITARIO: el precio es de una copa, no de la jarra.
  const utilidad = precio === null ? null : precio - costoUnitario;
  const costoPct = precio === null || precio === 0 ? null : (costoUnitario / precio) * 100;

  return {
    renglones,
    costoTotal: total,
    costoUnitario,
    sinCostear,
    precio,
    utilidad,
    costoPct,
    margenPct: costoPct === null ? null : 100 - costoPct,
  };
}

/** Lo que las pantallas necesitan saber de una propuesta para listarla o abrirla. */
export const COSTEADOR_INCLUDE = {
  category: { select: { name: true } },
  createdBy: { select: { name: true, firstName: true, lastName: true, email: true } },
  recipe: { select: { id: true, name: true, archivedAt: true } },
  items: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      product: { select: { name: true, baseUnit: true } },
      subRecipe: { select: { name: true, yieldUnit: true } },
    },
  },
} satisfies Prisma.CosteadorInclude;

/** El nombre de quien capturo, con la misma regla que el resto de la app. */
export function nombreDe(
  u: { name: string | null; firstName: string | null; lastName: string | null; email: string } | null,
): string {
  if (!u) return "—";
  const completo = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return completo || u.name || u.email;
}
