import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Precios de venta interna: a cuanto una sucursal le traspasa sus productos y subrecetas a otra.
 *
 * El numero vive por sucursal que VENDE, no por catalogo, porque el CEDIS y un restaurante no
 * tienen por que traspasar la misma salsa al mismo precio. Al enviar una requisicion el precio
 * se copia al renglon y se congela ahi; esta tabla solo guarda el precio vigente.
 */

/** Precios vigentes de productos para la sucursal que vende. Clave: productId. */
export async function getInternalProductPrices(
  sucursalId: string,
  productIds: string[],
): Promise<Map<string, Decimal>> {
  const out = new Map<string, Decimal>();
  if (productIds.length === 0) return out;
  const filas = await prisma.internalTransferPrice.findMany({
    where: { sucursalId, productId: { in: productIds }, price: { gt: 0 } },
    select: { productId: true, price: true },
  });
  for (const f of filas) {
    if (f.productId) out.set(f.productId, new Decimal(f.price));
  }
  return out;
}

/** Precios vigentes de subrecetas para la sucursal que vende. Clave: recipeId. */
export async function getInternalRecipePrices(
  sucursalId: string,
  recipeIds: string[],
): Promise<Map<string, Decimal>> {
  const out = new Map<string, Decimal>();
  if (recipeIds.length === 0) return out;
  const filas = await prisma.internalTransferPrice.findMany({
    where: { sucursalId, recipeId: { in: recipeIds }, price: { gt: 0 } },
    select: { recipeId: true, price: true },
  });
  for (const f of filas) {
    if (f.recipeId) out.set(f.recipeId, new Decimal(f.price));
  }
  return out;
}

/**
 * Lo que vale un renglon traspasado para quien lo recibe.
 *
 * Sin precio capturado el traspaso va a costo, exactamente como antes de que existiera este
 * modulo: un negocio que no quiera manejar precios internos no tiene que capturar nada y su
 * reporte no cambia.
 */
export function precioDeTraspaso(item: {
  unitCost: Decimal.Value;
  unitPrice: Decimal.Value | null;
}): Decimal {
  return item.unitPrice !== null && item.unitPrice !== undefined
    ? new Decimal(item.unitPrice)
    : new Decimal(item.unitCost);
}

/**
 * Deja pegado en la sucursal que recibe el costo al que acaba de entrar la mercancia.
 *
 * Sin esto el traspaso entra a $250 pero el siguiente conteo lo valua a $200 y aparecen $50 de
 * perdida fantasma en cada movimiento. Son dos caminos distintos porque el catalogo de productos
 * es compartido entre sucursales y el de subrecetas no:
 *
 *   - Producto: SucursalProductCost, que es justo la tabla de "cuanto cuesta esto en esta
 *     sucursal". Solo se consulta cuando la sucursal no ha comprado el producto ella misma; si
 *     lo compra, su propia compra manda, y esta bien que mande.
 *   - Subreceta: manualCost de la copia que la sucursal destino tiene de esa subreceta. Ese
 *     campo es el respaldo que usa resolveRecipeCost cuando el costeo real no alcanza, que es
 *     justo el caso de una sucursal que recibe la salsa en vez de prepararla. La que si la
 *     prepara sigue costeando con sus insumos y este numero nunca la toca.
 *
 * `manualCost` guarda el costo del RENDIMIENTO COMPLETO, no el unitario: por eso se multiplica
 * por yieldQty.
 */
export async function pegarCostoEnDestino(
  tx: Prisma.TransactionClient,
  toSucursalId: string,
  renglones: {
    productId?: string | null;
    destSubRecipeId?: string | null;
    unitPrice?: string | null;
  }[],
): Promise<void> {
  // Si un mismo producto va en dos renglones, el ultimo precio es el que queda.
  const porProducto = new Map<string, string>();
  const porReceta = new Map<string, string>();
  for (const r of renglones) {
    if (!r.unitPrice) continue;
    if (r.productId) porProducto.set(r.productId, r.unitPrice);
    else if (r.destSubRecipeId) porReceta.set(r.destSubRecipeId, r.unitPrice);
  }

  for (const [productId, price] of porProducto) {
    await tx.sucursalProductCost.upsert({
      where: { sucursalId_productId: { sucursalId: toSucursalId, productId } },
      create: { sucursalId: toSucursalId, productId, unitCost: price, source: "traspaso" },
      update: { unitCost: price, source: "traspaso" },
    });
  }

  if (porReceta.size > 0) {
    const recetas = await tx.recipe.findMany({
      where: { id: { in: [...porReceta.keys()] } },
      select: { id: true, yieldQty: true },
    });
    for (const receta of recetas) {
      const unitario = new Decimal(porReceta.get(receta.id)!);
      await tx.recipe.update({
        where: { id: receta.id },
        data: { manualCost: unitario.times(receta.yieldQty).toString() },
      });
    }
  }
}
