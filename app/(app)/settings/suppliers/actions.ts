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

export async function updateSupplierName(supplierId: string, name: string): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const trimmed = name.trim();
    if (!trimmed) throw new Error("El nombre del proveedor es obligatorio.");

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const duplicate = await prisma.supplier.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: trimmed, mode: "insensitive" },
        id: { not: supplierId },
      },
    });
    if (duplicate) throw new Error("Ya existe un proveedor con ese nombre.");

    // Solo cambia Supplier.name; compras, pedidos y pagos lo referencian por supplierId, nunca
    // guardan el nombre por separado, asi que esto se refleja de inmediato en todo lo ya capturado.
    await prisma.supplier.update({ where: { id: supplier.id }, data: { name: trimmed } });

    revalidatePath("/settings/suppliers");
    revalidatePath("/purchases");
    revalidatePath("/orders");
    revalidatePath("/payments");
    return {};
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un proveedor con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo renombrar el proveedor." };
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

export async function toggleSupplierActive(supplierId: string, isActive: boolean) {
  const user = await requireOrgSession();

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: user.organizationId },
  });
  if (!supplier) throw new Error("Proveedor no encontrado.");

  await prisma.supplier.update({ where: { id: supplier.id }, data: { isActive } });

  revalidatePath("/settings/suppliers");
  revalidatePath("/purchases/new");
  revalidatePath("/orders/new");
}

export type SupplierDetailsState = { error?: string; success?: boolean };

/** Campos puramente informativos: ninguno es obligatorio, no afectan costeo ni calculos. */
export async function updateSupplierDetails(
  supplierId: string,
  _prevState: SupplierDetailsState,
  formData: FormData,
): Promise<SupplierDetailsState> {
  try {
    const user = await requireOrgSession();

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const text = (key: string) => {
      const v = String(formData.get(key) ?? "").trim();
      return v || null;
    };

    const creditDaysRaw = String(formData.get("creditDays") ?? "").trim();
    const creditDays = creditDaysRaw ? Number(creditDaysRaw) : null;
    if (creditDays !== null && (!Number.isInteger(creditDays) || creditDays < 0)) {
      throw new Error("Los dias de credito deben ser un numero entero valido.");
    }

    await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        rfc: text("rfc"),
        businessName: text("businessName"),
        address: text("address"),
        paymentMethod: text("paymentMethod"),
        contactName: text("contactName"),
        bankInfo: text("bankInfo"),
        notes: text("notes"),
        creditDays,
      },
    });

    revalidatePath(`/settings/suppliers/${supplierId}`);
    revalidatePath("/settings/suppliers");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la informacion." };
  }
}

export async function addSupplierPhone(
  supplierId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const phone = String(formData.get("phone") ?? "").trim();
    if (!phone) throw new Error("El numero es obligatorio.");
    const label = String(formData.get("label") ?? "").trim();

    await prisma.supplierPhone.create({
      data: { supplierId, phone, label: label || null },
    });

    revalidatePath(`/settings/suppliers/${supplierId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar el numero." };
  }
}

export async function deleteSupplierPhone(phoneId: string) {
  const user = await requireOrgSession();
  const phone = await prisma.supplierPhone.findFirst({
    where: { id: phoneId, supplier: { organizationId: user.organizationId } },
    select: { id: true, supplierId: true },
  });
  if (!phone) throw new Error("Numero no encontrado.");

  await prisma.supplierPhone.delete({ where: { id: phone.id } });
  revalidatePath(`/settings/suppliers/${phone.supplierId}`);
}

export async function addSupplierEmail(
  supplierId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const email = String(formData.get("email") ?? "").trim();
    if (!email) throw new Error("El correo es obligatorio.");
    const label = String(formData.get("label") ?? "").trim();

    await prisma.supplierEmail.create({
      data: { supplierId, email, label: label || null },
    });

    revalidatePath(`/settings/suppliers/${supplierId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar el correo." };
  }
}

export async function deleteSupplierEmail(emailId: string) {
  const user = await requireOrgSession();
  const email = await prisma.supplierEmail.findFirst({
    where: { id: emailId, supplier: { organizationId: user.organizationId } },
    select: { id: true, supplierId: true },
  });
  if (!email) throw new Error("Correo no encontrado.");

  await prisma.supplierEmail.delete({ where: { id: email.id } });
  revalidatePath(`/settings/suppliers/${email.supplierId}`);
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
