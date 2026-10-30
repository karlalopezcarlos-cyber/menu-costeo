"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

/**
 * Guarda la categoria de varias recetas de un jalon.
 *
 * Mismo criterio que la pantalla de productos: solo se escriben las que de verdad cambiaron, y
 * se agrupan por categoria destino para mandar un updateMany por categoria en vez de uno por
 * receta. Una carta recien cargada de Talos son cientos de PLUs que hay que acomodar de un tiron.
 */
export async function saveRecipeCategories(formData: FormData) {
  const user = await requireSucursalContext();

  const [recipes, categories] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      select: { id: true, categoryId: true },
    }),
    prisma.recipeCategory.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    }),
  ]);
  const categoriaPorReceta = new Map(recipes.map((r) => [r.id, r.categoryId]));
  const categoriasValidas = new Set(categories.map((c) => c.id));

  const porCategoria = new Map<string | null, string[]>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("category:")) continue;
    const recipeId = key.slice("category:".length);
    if (!categoriaPorReceta.has(recipeId)) continue;

    const valor = String(rawValue).trim();
    const nueva = valor || null;
    if (nueva && !categoriasValidas.has(nueva)) continue;
    if (categoriaPorReceta.get(recipeId) === nueva) continue;

    const lista = porCategoria.get(nueva) ?? [];
    lista.push(recipeId);
    porCategoria.set(nueva, lista);
  }

  for (const [categoryId, recipeIds] of porCategoria) {
    await prisma.recipe.updateMany({
      where: { id: { in: recipeIds }, sucursalId: user.sucursalId },
      data: { categoryId },
    });
  }

  revalidatePath("/recipes");
  revalidatePath("/recipes/categories");
  // La categoria de la receta decide en que grupo de costo cae su venta.
  revalidatePath("/dashboard");
  revalidatePath("/menu-engineering");
}
