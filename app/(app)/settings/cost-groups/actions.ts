"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

/**
 * Grupos de costo: las columnas del Estado de Resultados.
 *
 * Antes eran tres fijos en el codigo. Son la forma en que cada negocio separa sus gastos, y eso
 * no se parece entre un restaurante, una cafeteria y una barra; tenia que ser configuracion.
 */
export async function createCostGroup(formData: FormData) {
  const user = await requireOrgSession();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle nombre al grupo.");

  const ultimo = await prisma.costGroup.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    await prisma.costGroup.create({
      data: {
        organizationId: user.organizationId,
        name,
        sortOrder: (ultimo?.sortOrder ?? 0) + 1,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Ya existe un grupo con ese nombre.");
    }
    throw error;
  }

  revalidatePath("/settings/cost-groups");
  revalidatePath("/dashboard");
}

export async function renameCostGroup(
  costGroupId: string,
  name: string,
): Promise<{ error?: string }> {
  const user = await requireOrgSession();

  const grupo = await prisma.costGroup.findFirst({
    where: { id: costGroupId, organizationId: user.organizationId },
  });
  if (!grupo) throw new Error("Grupo no encontrado.");

  const limpio = name.trim();
  if (!limpio) return { error: "El nombre no puede quedar vacio." };

  try {
    await prisma.costGroup.update({ where: { id: grupo.id }, data: { name: limpio } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un grupo con ese nombre." };
    }
    throw error;
  }

  revalidatePath("/settings/cost-groups");
  revalidatePath("/dashboard");
  return {};
}

/** Mueve un grupo una posicion arriba o abajo: define el orden de las columnas del reporte. */
export async function moveCostGroup(costGroupId: string, direction: "up" | "down") {
  const user = await requireOrgSession();

  const grupos = await prisma.costGroup.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const indice = grupos.findIndex((g) => g.id === costGroupId);
  if (indice === -1) throw new Error("Grupo no encontrado.");
  const destino = direction === "up" ? indice - 1 : indice + 1;
  if (destino < 0 || destino >= grupos.length) return;

  const reordenados = [...grupos];
  [reordenados[indice], reordenados[destino]] = [reordenados[destino], reordenados[indice]];

  await prisma.$transaction(
    reordenados.map((g, i) =>
      prisma.costGroup.update({ where: { id: g.id }, data: { sortOrder: i + 1 } }),
    ),
  );

  revalidatePath("/settings/cost-groups");
  revalidatePath("/dashboard");
}

/**
 * Borra un grupo. Las categorias que lo usaban quedan sin grupo, no se borran: perder la
 * categoria de decenas de productos por quitar una columna del reporte seria desproporcionado.
 */
export async function deleteCostGroup(costGroupId: string) {
  const user = await requireOrgSession();

  const grupo = await prisma.costGroup.findFirst({
    where: { id: costGroupId, organizationId: user.organizationId },
  });
  if (!grupo) throw new Error("Grupo no encontrado.");

  await prisma.costGroup.delete({ where: { id: grupo.id } });

  revalidatePath("/settings/cost-groups");
  revalidatePath("/settings/categories");
  revalidatePath("/settings/recipe-categories");
  revalidatePath("/dashboard");
}
