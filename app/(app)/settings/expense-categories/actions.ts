"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

export async function createExpenseCategory(formData: FormData) {
  const user = await requireOrgSession();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle nombre al tipo de gasto.");

  const ultimo = await prisma.expenseCategory.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    await prisma.expenseCategory.create({
      data: {
        organizationId: user.organizationId,
        name,
        sortOrder: (ultimo?.sortOrder ?? 0) + 1,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Ya existe un tipo de gasto con ese nombre.");
    }
    throw error;
  }

  revalidatePath("/settings/expense-categories");
  revalidatePath("/expenses");
}

export async function renameExpenseCategory(
  categoryId: string,
  name: string,
): Promise<{ error?: string }> {
  const user = await requireOrgSession();

  const categoria = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!categoria) throw new Error("Tipo de gasto no encontrado.");

  const limpio = name.trim();
  if (!limpio) return { error: "El nombre no puede quedar vacio." };

  try {
    await prisma.expenseCategory.update({ where: { id: categoria.id }, data: { name: limpio } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un tipo de gasto con ese nombre." };
    }
    throw error;
  }

  revalidatePath("/settings/expense-categories");
  revalidatePath("/expenses");
  return {};
}

/** Los gastos ya registrados no se borran: quedan sin tipo, que es informacion, no basura. */
export async function deleteExpenseCategory(categoryId: string) {
  const user = await requireOrgSession();

  const categoria = await prisma.expenseCategory.findFirst({
    where: { id: categoryId, organizationId: user.organizationId },
  });
  if (!categoria) throw new Error("Tipo de gasto no encontrado.");

  await prisma.expenseCategory.delete({ where: { id: categoria.id } });

  revalidatePath("/settings/expense-categories");
  revalidatePath("/expenses");
}
