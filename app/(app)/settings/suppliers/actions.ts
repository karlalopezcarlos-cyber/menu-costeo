"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

export async function createSupplier(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre del proveedor es obligatorio.");
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();

    const existing = await prisma.supplier.findFirst({
      where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) throw new Error("Ya existe un proveedor con ese nombre.");

    await prisma.supplier.create({
      data: { organizationId: user.organizationId, name, phone: phone || null, email: email || null },
    });

    revalidatePath("/settings/suppliers");
    revalidatePath("/purchases");
    revalidatePath("/purchases/new");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un proveedor con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear el proveedor." };
  }
}

export async function updateSupplierContact(
  supplierId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireOrgSession();

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();

    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { phone: phone || null, email: email || null },
    });

    revalidatePath("/settings/suppliers");
    revalidatePath("/orders");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el proveedor." };
  }
}

export async function deleteSupplier(supplierId: string) {
  const user = await requireOrgSession();

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: user.organizationId },
  });
  if (!supplier) throw new Error("Proveedor no encontrado.");

  // Las compras que lo usan quedan sin proveedor (supplierId -> null), no se bloquea el borrado.
  await prisma.supplier.delete({ where: { id: supplier.id } });

  revalidatePath("/settings/suppliers");
  revalidatePath("/purchases");
  revalidatePath("/purchases/new");
}
