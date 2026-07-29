"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

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
