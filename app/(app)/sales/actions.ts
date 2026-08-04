"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

export async function upsertDailySale(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const recipeId = String(formData.get("recipeId") ?? "");
    const dateRaw = String(formData.get("date") ?? "");
    const quantitySold = new Decimal(String(formData.get("quantitySold") ?? "0"));
    const unitPrice = new Decimal(String(formData.get("unitPrice") ?? "0"));

    if (!recipeId) throw new Error("Selecciona un platillo.");
    if (!dateRaw) throw new Error("Indica la fecha de la venta.");
    if (quantitySold.lt(0)) throw new Error("La cantidad no puede ser negativa.");
    if (unitPrice.lt(0)) throw new Error("El precio no puede ser negativo.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, organizationId: user.organizationId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const date = new Date(`${dateRaw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

    await prisma.dailySale.upsert({
      where: {
        organizationId_recipeId_date: { organizationId: user.organizationId, recipeId: recipe.id, date },
      },
      create: {
        organizationId: user.organizationId,
        recipeId: recipe.id,
        date,
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
      update: {
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la venta." };
  }

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  return {};
}

export async function updateDailySale(
  saleId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const sale = await prisma.dailySale.findFirst({
      where: { id: saleId, organizationId: user.organizationId },
    });
    if (!sale) throw new Error("Venta no encontrada.");

    const recipeId = String(formData.get("recipeId") ?? "");
    const dateRaw = String(formData.get("date") ?? "");
    const quantitySold = new Decimal(String(formData.get("quantitySold") ?? "0"));
    const unitPrice = new Decimal(String(formData.get("unitPrice") ?? "0"));

    if (!recipeId) throw new Error("Selecciona un platillo.");
    if (!dateRaw) throw new Error("Indica la fecha de la venta.");
    if (quantitySold.lt(0)) throw new Error("La cantidad no puede ser negativa.");
    if (unitPrice.lt(0)) throw new Error("El precio no puede ser negativo.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, organizationId: user.organizationId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const date = new Date(`${dateRaw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

    // Si cambiaron la fecha o el platillo, nos aseguramos de no chocar con otra venta ya
    // existente para esa combinacion (en vez de sobreescribirla en silencio).
    if (recipeId !== sale.recipeId || date.getTime() !== sale.date.getTime()) {
      const conflict = await prisma.dailySale.findFirst({
        where: { organizationId: user.organizationId, recipeId, date, id: { not: sale.id } },
      });
      if (conflict) {
        throw new Error("Ya existe una venta de ese platillo en esa fecha; edita esa fila en su lugar.");
      }
    }

    await prisma.dailySale.update({
      where: { id: sale.id },
      data: {
        recipeId,
        date,
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la venta." };
  }

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  return {};
}

export async function deleteDailySale(saleId: string): Promise<void> {
  const user = await requireOrgSession();
  const sale = await prisma.dailySale.findFirst({
    where: { id: saleId, organizationId: user.organizationId },
  });
  if (!sale) throw new Error("Venta no encontrada.");

  await prisma.dailySale.delete({ where: { id: sale.id } });

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
}
