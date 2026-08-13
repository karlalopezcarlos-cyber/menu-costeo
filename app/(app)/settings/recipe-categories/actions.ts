"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma, CategoryGroup } from "@/generated/prisma/client";

export async function createRecipeCategory(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre de la categoria es obligatorio.");

    const existing = await prisma.recipeCategory.findFirst({
      where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) throw new Error("Ya existe una categoria con ese nombre.");

    await prisma.recipeCategory.create({
      data: { organizationId: user.organizationId, name },
    });

    revalidatePath("/settings/recipe-categories");
    revalidatePath("/recipes");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una categoria con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear la categoria." };
  }
}

export async function updateRecipeCategoryName(categoryId: string, name: string): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("El nombre de la categoria es obligatorio.");

    const category = await prisma.recipeCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId },
    });
    if (!category) throw new Error("Categoria no encontrada.");

    const duplicate = await prisma.recipeCategory.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: trimmed, mode: "insensitive" },
        id: { not: categoryId },
      },
    });
    if (duplicate) throw new Error("Ya existe una categoria con ese nombre.");

    // Solo cambia RecipeCategory.name; las recetas la referencian por categoryId, nunca guardan
    // el nombre por separado, asi que esto se refleja de inmediato en todo lo que ya tenga
    // movimientos (ventas, ingenieria de menu, estado de resultados, etc.).
    await prisma.recipeCategory.update({ where: { id: category.id }, data: { name: trimmed } });

    revalidatePath("/settings/recipe-categories");
    revalidatePath("/recipes");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una categoria con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo renombrar la categoria." };
  }
}

export async function updateRecipeCategoryGroup(categoryId: string, group: string) {
  const user = await requireOrgSession();

  const category = await prisma.recipeCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!category) throw new Error("Categoria no encontrada.");

  await prisma.recipeCategory.update({
    where: { id: category.id },
    data: { group: group ? (group as CategoryGroup) : null },
  });

  revalidatePath("/settings/recipe-categories");
  revalidatePath("/dashboard");
}

export async function deleteRecipeCategory(categoryId: string) {
  const user = await requireOrgSession();

  const category = await prisma.recipeCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!category) throw new Error("Categoria no encontrada.");

  // Las recetas que la usan quedan sin categoria (categoryId -> null), no se bloquea el borrado.
  await prisma.recipeCategory.delete({ where: { id: category.id } });

  revalidatePath("/settings/recipe-categories");
  revalidatePath("/recipes");
}
