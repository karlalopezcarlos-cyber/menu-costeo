"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

/**
 * Guarda el precio de venta que quedo en el simulador.
 *
 * Vive aparte de recipes/actions.ts porque ahi la edicion de precio viaja junto con el resto
 * de los datos de la receta (nombre, rendimiento, categoria), y aqui solo se toca el precio.
 */
export async function updateRecipeSellingPrice(
  recipeId: string,
  sellingPrice: number,
): Promise<{ error?: string } | void> {
  const user = await requireSucursalContext();

  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return { error: "El precio debe ser mayor a cero." };
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId },
    select: { id: true },
  });
  if (!recipe) return { error: "Receta no encontrada." };

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { sellingPrice: sellingPrice.toFixed(2) },
  });

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/menu-engineering");
}
