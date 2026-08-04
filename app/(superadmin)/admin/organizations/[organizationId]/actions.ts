"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenant";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

function parseAllowedPanels(formData: FormData): Panel[] {
  const valid = new Set(PANEL_DEFS.map((p) => p.key));
  return formData
    .getAll("allowedPanels")
    .map((v) => String(v))
    .filter((v): v is Panel => valid.has(v as Panel));
}

export async function updateOrgUser(
  organizationId: string,
  userId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await requireRole(["SUPERADMIN"]);

    const target = await prisma.user.findFirst({ where: { id: userId, organizationId } });
    if (!target) throw new Error("Usuario no encontrado.");

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const allowedPanels = target.role === "OWNER" ? target.allowedPanels : parseAllowedPanels(formData);

    let sucursalId = target.sucursalId;
    if (target.role !== "OWNER") {
      sucursalId = String(formData.get("sucursalId") ?? "").trim() || null;
      if (!sucursalId) throw new Error("Asigna una sucursal al usuario.");
      const sucursal = await prisma.sucursal.findFirst({ where: { id: sucursalId, organizationId } });
      if (!sucursal) throw new Error("Sucursal invalida.");
    }

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

  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/admin/organizations");
  return {};
}

export async function toggleOrgUserActive(
  organizationId: string,
  userId: string,
  isActive: boolean,
): Promise<void> {
  await requireRole(["SUPERADMIN"]);

  const target = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!target) throw new Error("Usuario no encontrado.");

  await prisma.user.update({ where: { id: target.id }, data: { isActive } });

  revalidatePath(`/admin/organizations/${organizationId}`);
  revalidatePath("/admin/organizations");
}
