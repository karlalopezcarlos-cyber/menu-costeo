"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenant";

export type CreateOrganizationState = {
  error?: string;
  success?: { orgName: string; email: string; password: string };
};

export async function createOrganization(
  _prevState: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  try {
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
      await tx.sucursal.create({
        data: { organizationId: org.id, name: "Sucursal Principal", isCentral: true },
      });
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
    // No redirigimos: regresamos las credenciales en claro (solo existen en este request, nunca
    // se guardan sin hashear) para que la pantalla pueda mostrarlas y copiarlas.
    return { success: { orgName, email: ownerEmail, password: ownerPassword } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el cliente." };
  }
}

export async function toggleOrganizationActive(organizationId: string, isActive: boolean) {
  await requireRole(["SUPERADMIN"]);

  await prisma.organization.update({
    where: { id: organizationId },
    data: { isActive },
  });

  revalidatePath("/admin/organizations");
}

/**
 * Borra permanentemente un cliente (organizacion) y absolutamente todos sus datos: usuarios,
 * sucursales, catalogo, y todo lo capturado. A diferencia de desactivar, esto no se puede
 * deshacer. El orden respeta las FK sin onDelete: Cascade del schema (ver Recipe/RecipeItem:
 * borrar recipe_items explicitamente antes de las recetas evita violar el CHECK
 * "recipe_item_exactly_one_target" que la cascada por si sola dispararia).
 */
export async function deleteOrganization(organizationId: string) {
  await requireRole(["SUPERADMIN"]);

  await prisma.$transaction(
    async (tx) => {
      await tx.dailySale.deleteMany({ where: { organizationId } });
      await tx.dishAlias.deleteMany({ where: { organizationId } });
      await tx.productionEntry.deleteMany({ where: { organizationId } });
      await tx.inventoryCount.deleteMany({ where: { organizationId } });
      await tx.wasteEntry.deleteMany({ where: { organizationId } });
      await tx.purchaseOrder.deleteMany({ where: { organizationId } });
      await tx.purchase.deleteMany({ where: { organizationId } });
      await tx.supplierPayment.deleteMany({ where: { organizationId } });
      await tx.requisicion.deleteMany({ where: { organizationId } });
      await tx.importBatch.deleteMany({ where: { organizationId } });

      await tx.recipeItem.deleteMany({ where: { recipe: { organizationId } } });
      await tx.recipe.deleteMany({ where: { organizationId } });
      await tx.product.deleteMany({ where: { organizationId } });

      await tx.productCategory.deleteMany({ where: { organizationId } });
      await tx.recipeCategory.deleteMany({ where: { organizationId } });
      await tx.supplier.deleteMany({ where: { organizationId } });

      await tx.sucursal.deleteMany({ where: { organizationId } });
      await tx.user.deleteMany({ where: { organizationId } });

      await tx.organization.delete({ where: { id: organizationId } });
    },
    { timeout: 30000 },
  );

  revalidatePath("/admin/organizations");
}
