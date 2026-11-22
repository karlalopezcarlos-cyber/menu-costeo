"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { TASAS_IVA_COMUNES } from "@/lib/taxes";

/**
 * Fija (o borra) el precio al que esta sucursal le traspasa un producto o una subreceta a otra.
 *
 * Vacio o cero borra el precio: ese renglon vuelve a traspasarse a costo, que es como funcionaba
 * todo antes de que existieran los precios internos. Es la unica forma de "apagarlo" sin tener
 * que inventar un precio igual al costo, que ademas se desactualizaria solo.
 */
export async function setInternalPrice(
  tipo: "product" | "recipe",
  id: string,
  precioRaw: string,
  /** Tasa de IVA en por ciento. Se ignora si el precio queda vacio. */
  ivaRateRaw: number = 0,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();

  // Solo las tasas que la app ofrece. Una tasa inventada desde fuera cambiaria lo que se le
  // factura a otra sucursal, asi que no se acepta aunque venga bien formada.
  if (!TASAS_IVA_COMUNES.includes(ivaRateRaw)) {
    return { error: "Tasa de IVA no valida." };
  }
  const ivaRate = ivaRateRaw.toString();

  const texto = precioRaw.trim();
  let precio: Decimal | null = null;
  if (texto !== "") {
    try {
      precio = new Decimal(texto.replace(/,/g, ""));
    } catch {
      return { error: "El precio no es un numero valido." };
    }
    if (precio.isNaN() || precio.lt(0)) return { error: "El precio no puede ser negativo." };
    if (precio.isZero()) precio = null;
  }

  if (tipo === "product") {
    const existe = await prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existe) return { error: "Producto no encontrado." };

    if (precio === null) {
      await prisma.internalTransferPrice.deleteMany({
        where: { sucursalId: user.sucursalId, productId: id },
      });
    } else {
      await prisma.internalTransferPrice.upsert({
        where: { sucursalId_productId: { sucursalId: user.sucursalId, productId: id } },
        create: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          productId: id,
          price: precio.toString(),
          ivaRate,
        },
        update: { price: precio.toString(), ivaRate },
      });
    }
  } else {
    // La subreceta tiene que ser de ESTA sucursal: el precio es el de quien vende, y cada
    // sucursal tiene su propia copia de cada subreceta.
    const existe = await prisma.recipe.findFirst({
      where: { id, sucursalId: user.sucursalId, archivedAt: null },
      select: { id: true },
    });
    if (!existe) return { error: "Subreceta no encontrada en esta sucursal." };

    if (precio === null) {
      await prisma.internalTransferPrice.deleteMany({
        where: { sucursalId: user.sucursalId, recipeId: id },
      });
    } else {
      await prisma.internalTransferPrice.upsert({
        where: { sucursalId_recipeId: { sucursalId: user.sucursalId, recipeId: id } },
        create: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          recipeId: id,
          price: precio.toString(),
          ivaRate,
        },
        update: { price: precio.toString(), ivaRate },
      });
    }
  }

  revalidatePath("/internal-sales/precios");
  revalidatePath("/internal-sales");
  return {};
}
