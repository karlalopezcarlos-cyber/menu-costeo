"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenant";

export async function createOrganization(formData: FormData) {
  await requireRole(["SUPERADMIN"]);

  const orgName = String(formData.get("orgName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");

  if (!orgName) throw new Error("El nombre del restaurante es obligatorio.");
  if (!ownerEmail || !ownerPassword) throw new Error("Correo y contrasena del dueno son obligatorios.");
  if (ownerPassword.length < 8) throw new Error("La contrasena debe tener al menos 8 caracteres.");

  const hashedPassword = await bcrypt.hash(ownerPassword, 10);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    await tx.user.create({
      data: {
        email: ownerEmail,
        hashedPassword,
        name: ownerName || null,
        role: "OWNER",
        organizationId: org.id,
      },
    });
  });

  revalidatePath("/admin/organizations");
  redirect("/admin/organizations");
}

export async function toggleOrganizationActive(organizationId: string, isActive: boolean) {
  await requireRole(["SUPERADMIN"]);

  await prisma.organization.update({
    where: { id: organizationId },
    data: { isActive },
  });

  revalidatePath("/admin/organizations");
}
