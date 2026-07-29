"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { createRecipeAndLinkRow, ignoreRowPermanently, linkRowToRecipe } from "@/lib/import-processing";

async function getRow(batchId: string, rowId: string, organizationId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, organizationId } });
  if (!batch) throw new Error("Lote de importacion no encontrado.");
  const row = await prisma.importRow.findFirst({ where: { id: rowId, importBatchId: batch.id } });
  if (!row) throw new Error("Fila no encontrada.");
  return row;
}

export async function linkRowToExistingRecipe(batchId: string, rowId: string, formData: FormData) {
  const user = await requireOrgSession();
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!recipeId) throw new Error("Selecciona una receta.");

  const row = await getRow(batchId, rowId, user.organizationId);
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: user.organizationId },
  });
  if (!recipe) throw new Error("Receta no encontrada.");

  await linkRowToRecipe(user.organizationId, row, recipe.id);

  revalidatePath(`/sales/import/${batchId}/review`);
  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
}

export async function createRecipeForRow(batchId: string, rowId: string) {
  const user = await requireOrgSession();
  const row = await getRow(batchId, rowId, user.organizationId);

  const recipe = await createRecipeAndLinkRow(user.organizationId, row);

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  redirect(`/recipes/${recipe.id}`);
}

export async function ignoreRowAlways(batchId: string, rowId: string) {
  const user = await requireOrgSession();
  const row = await getRow(batchId, rowId, user.organizationId);

  await ignoreRowPermanently(user.organizationId, row);

  revalidatePath(`/sales/import/${batchId}/review`);
}
