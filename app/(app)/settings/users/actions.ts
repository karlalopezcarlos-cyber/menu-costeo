"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

async function requireOwner() {
  const user = await requireOrgSession();
  if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede administrar usuarios.");
  return user;
}

function parseAllowedPanels(formData: FormData): Panel[] {
  const valid = new Set(PANEL_DEFS.map((p) => p.key));
  return formData
    .getAll("allowedPanels")
    .map((v) => String(v))
    .filter((v): v is Panel => valid.has(v as Panel));
}

export async function updateOrganizationName(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();
    const name = String(formData.get("name") ?? "").trim();
    if (!name) throw new Error("El nombre no puede quedar vacio.");

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { name },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el nombre." };
  }

  revalidatePath("/settings/users");
  return {};
}

async function resolveSucursalId(organizationId: string, formData: FormData): Promise<string | null> {
  const sucursalId = String(formData.get("sucursalId") ?? "").trim();
  if (!sucursalId) throw new Error("Asigna una sucursal al usuario.");
  const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, organizationId } });
  if (!sucursal) throw new Error("Sucursal invalida.");
  return sucursal.id;
}

export async function createUser(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const allowedPanels = parseAllowedPanels(formData);
    const sucursalId = await resolveSucursalId(user.organizationId, formData);

    if (!email) throw new Error("El correo es obligatorio.");
    if (password.length < 8) throw new Error("La contrasena debe tener al menos 8 caracteres.");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error("Ya existe un usuario con ese correo.");

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        name: name || null,
        hashedPassword,
        role: "STAFF",
        organizationId: user.organizationId,
        allowedPanels,
        sucursalId,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el usuario." };
  }

  revalidatePath("/settings/users");
  return {};
}

export async function updateUser(
  userId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
    });
    if (!target) throw new Error("Usuario no encontrado.");
    if (target.role === "OWNER") throw new Error("No se puede editar al dueno de la cuenta desde aqui.");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const allowedPanels = parseAllowedPanels(formData);
    const sucursalId = await resolveSucursalId(user.organizationId, formData);

    if (!email) throw new Error("El correo es obligatorio.");

    if (email !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new Error("Ya existe un usuario con ese correo.");
    }

    if (password && password.length < 8) {
      throw new Error("La contrasena debe tener al menos 8 caracteres.");
    }

    await prisma.user.update({
      where: { id: target.id },
      data: {
        email,
        name: name || null,
        allowedPanels,
        sucursalId,
        ...(password ? { hashedPassword: await bcrypt.hash(password, 10) } : {}),
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el usuario." };
  }

  revalidatePath("/settings/users");
  return {};
}

export async function toggleUserActive(userId: string, isActive: boolean): Promise<void> {
  const user = await requireOwner();

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: user.organizationId },
  });
  if (!target) throw new Error("Usuario no encontrado.");
  if (target.role === "OWNER") throw new Error("No se puede desactivar al dueno de la cuenta.");

  await prisma.user.update({ where: { id: target.id }, data: { isActive } });

  revalidatePath("/settings/users");
}
