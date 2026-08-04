"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

async function requireOwner() {
  const user = await requireOrgSession();
  if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede administrar sucursales.");
  return user;
}

export async function createSucursal(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre de la sucursal es obligatorio.");

    await prisma.sucursal.create({
      data: { organizationId: user.organizationId, name },
    });

    revalidatePath("/settings/sucursales");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una sucursal con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear la sucursal." };
  }
}

export async function updateSucursal(
  sucursalId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();

    const target = await prisma.sucursal.findFirst({
      where: { id: sucursalId, organizationId: user.organizationId },
    });
    if (!target) throw new Error("Sucursal no encontrada.");

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre de la sucursal es obligatorio.");

    await prisma.sucursal.update({ where: { id: target.id }, data: { name } });

    revalidatePath("/settings/sucursales");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una sucursal con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la sucursal." };
  }
}

export async function toggleSucursalActive(sucursalId: string, isActive: boolean): Promise<void> {
  const user = await requireOwner();

  const target = await prisma.sucursal.findFirst({
    where: { id: sucursalId, organizationId: user.organizationId },
  });
  if (!target) throw new Error("Sucursal no encontrada.");
  if (target.isCentral) throw new Error("No se puede desactivar la sucursal principal.");

  await prisma.sucursal.update({ where: { id: target.id }, data: { isActive } });

  revalidatePath("/settings/sucursales");
}
