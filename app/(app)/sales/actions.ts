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
