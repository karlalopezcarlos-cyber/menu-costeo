"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_SIZE = 4 * 1024 * 1024;

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

export async function updateOrgLogo(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOwner();

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona una imagen.");
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      throw new Error("La imagen debe ser JPG, PNG o WEBP.");
    }
    if (file.size > MAX_LOGO_SIZE) {
      throw new Error("La imagen no debe pesar mas de 4MB.");
    }

    const original = Buffer.from(await file.arrayBuffer());
    // A diferencia de las fotos de receta (normalizadas a JPEG), el logo se normaliza a PNG para
    // conservar transparencia: se usa como marca de agua de fondo en los PDFs, y un fondo solido
    // detras del logo se veria como un rectangulo encima del contenido.
    const buffer = await sharp(original).rotate().png().toBuffer();

    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { logo: buffer, logoMimeType: "image/png" },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el logo." };
  }

  revalidatePath("/settings/users");
  return {};
}

export async function removeOrgLogo(): Promise<void> {
  const user = await requireOwner();

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { logo: null, logoMimeType: null },
  });

  revalidatePath("/settings/users");
}

async function resolveSucursalIds(organizationId: string, formData: FormData): Promise<string[]> {
  const ids = [...new Set(formData.getAll("sucursalIds").map((v) => String(v)))];
  if (ids.length === 0) throw new Error("Asigna al menos una sucursal al usuario.");
  const count = await prisma.sucursal.count({ where: { id: { in: ids }, organizationId } });
  if (count !== ids.length) throw new Error("Una o mas sucursales seleccionadas son invalidas.");
  return ids;
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
    const sucursalIds = await resolveSucursalIds(user.organizationId, formData);

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
        sucursales: { create: sucursalIds.map((sucursalId) => ({ sucursalId })) },
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
    const sucursalIds = await resolveSucursalIds(user.organizationId, formData);

    if (!email) throw new Error("El correo es obligatorio.");

    if (email !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new Error("Ya existe un usuario con ese correo.");
    }

    if (password && password.length < 8) {
      throw new Error("La contrasena debe tener al menos 8 caracteres.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: target.id },
        data: {
          email,
          name: name || null,
          allowedPanels,
          ...(password ? { hashedPassword: await bcrypt.hash(password, 10) } : {}),
        },
      }),
      prisma.userSucursal.deleteMany({ where: { userId: target.id } }),
      prisma.userSucursal.createMany({
        data: sucursalIds.map((sucursalId) => ({ userId: target.id, sucursalId })),
      }),
    ]);
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
