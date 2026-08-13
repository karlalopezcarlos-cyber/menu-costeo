"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma, CategoryGroup } from "@/generated/prisma/client";

export async function createCategory(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre de la categoria es obligatorio.");

    const existing = await prisma.productCategory.findFirst({
      where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) throw new Error("Ya existe una categoria con ese nombre.");

    await prisma.productCategory.create({
      data: { organizationId: user.organizationId, name },
    });

    revalidatePath("/settings/categories");
    revalidatePath("/products");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una categoria con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear la categoria." };
  }
}

export async function updateCategoryName(categoryId: string, name: string): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("El nombre de la categoria es obligatorio.");

    const category = await prisma.productCategory.findFirst({
      where: { id: categoryId, organizationId: user.organizationId },
    });
    if (!category) throw new Error("Categoria no encontrada.");

    const duplicate = await prisma.productCategory.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: trimmed, mode: "insensitive" },
        id: { not: categoryId },
      },
    });
    if (duplicate) throw new Error("Ya existe una categoria con ese nombre.");

    // Solo cambia el nombre de la categoria (ProductCategory.name); los productos, compras,
    // mermas, recetas, etc. la referencian por categoryId, nunca guardan el nombre por separado,
    // asi que este cambio se refleja de inmediato en todo lo que ya tenga movimientos.
    await prisma.productCategory.update({ where: { id: category.id }, data: { name: trimmed } });

    revalidatePath("/settings/categories");
    revalidatePath("/products");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una categoria con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo renombrar la categoria." };
  }
}

export async function updateCategoryGroup(categoryId: string, group: string) {
  const user = await requireOrgSession();

  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!category) throw new Error("Categoria no encontrada.");

  await prisma.productCategory.update({
    where: { id: category.id },
    data: { group: group ? (group as CategoryGroup) : null },
  });

  revalidatePath("/settings/categories");
  revalidatePath("/dashboard");
}

export async function deleteCategory(categoryId: string) {
  const user = await requireOrgSession();

  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!category) throw new Error("Categoria no encontrada.");

  // Los productos que la usan quedan sin categoria (categoryId -> null), no se bloquea el borrado.
  await prisma.productCategory.delete({ where: { id: category.id } });

  revalidatePath("/settings/categories");
  revalidatePath("/products");
}
