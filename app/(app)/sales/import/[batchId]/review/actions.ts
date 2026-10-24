"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import {
  createRecipeAndLinkRow,
  destinoAlTerminarCarga,
  ignoreRowPermanently,
  linkRowToRecipe,
} from "@/lib/import-processing";

/**
 * Si ya no queda nada por reconocer, la carga termino: se sale de esta pantalla hacia las
 * ventas por dia, que es donde se comprueba que entro lo que debia.
 */
async function salirSiYaNoQuedaNada(batchId: string) {
  const pendientes = await prisma.importRow.count({
    where: { importBatchId: batchId, status: "PENDING" },
  });
  if (pendientes === 0) redirect(await destinoAlTerminarCarga(batchId));
}

async function getRow(batchId: string, rowId: string, sucursalId: string) {
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, sucursalId } });
  if (!batch) throw new Error("Lote de importacion no encontrado.");
  const row = await prisma.importRow.findFirst({ where: { id: rowId, importBatchId: batch.id } });
  if (!row) throw new Error("Fila no encontrada.");
  return row;
}

export async function linkRowToExistingRecipe(batchId: string, rowId: string, formData: FormData) {
  const user = await requireSucursalContext();
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!recipeId) throw new Error("Selecciona una receta.");

  const row = await getRow(batchId, rowId, user.sucursalId);
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId },
  });
  if (!recipe) throw new Error("Receta no encontrada.");

  await linkRowToRecipe(user.organizationId, user.sucursalId, row, recipe.id);

  revalidatePath(`/sales/import/${batchId}/review`);
  revalidatePath("/sales");
  revalidatePath("/menu-engineering");

  await salirSiYaNoQuedaNada(batchId);
}

export async function createRecipeForRow(batchId: string, rowId: string) {
  const user = await requireSucursalContext();
  const row = await getRow(batchId, rowId, user.sucursalId);

  const recipe = await createRecipeAndLinkRow(user.organizationId, user.sucursalId, row);

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  redirect(`/recipes/${recipe.id}`);
}

export async function ignoreRowAlways(batchId: string, rowId: string) {
  const user = await requireSucursalContext();
  const row = await getRow(batchId, rowId, user.sucursalId);

  await ignoreRowPermanently(user.organizationId, user.sucursalId, row);

  revalidatePath(`/sales/import/${batchId}/review`);

  await salirSiYaNoQuedaNada(batchId);
}
