"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

/**
 * Una vinculacion de venta amarra el nombre que escupe el punto de venta ("AFFOGATO ESP.") con
 * el platillo del sistema. Se crea al importar y manda en todas las importaciones siguientes:
 * por eso tiene que poder corregirse. Antes, un nombre mal vinculado seguia mandando ventas al
 * platillo equivocado para siempre, y la unica salida era no volver a usar ese nombre.
 */
async function getAlias(aliasId: string, sucursalId: string) {
  const alias = await prisma.dishAlias.findFirst({ where: { id: aliasId, sucursalId } });
  if (!alias) throw new Error("Vinculacion no encontrada.");
  return alias;
}

/**
 * Cambia el platillo de una vinculacion.
 *
 * `moverVentas` decide que pasa con lo ya importado con ese nombre. Mover reconstruye las ventas
 * desde los renglones del archivo original, que son el unico lugar donde queda registrado cuanto
 * vendio CADA nombre: la venta diaria solo guarda el total por platillo.
 */
export async function updateAliasRecipe(aliasId: string, recipeId: string, moverVentas: boolean) {
  const user = await requireSucursalContext();
  const alias = await getAlias(aliasId, user.sucursalId);

  if (!recipeId) throw new Error("Elige el platillo al que se vincula.");
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId, archivedAt: null },
    select: { id: true },
  });
  if (!recipe) throw new Error("Platillo no encontrado.");

  const anterior = alias.recipeId;

  await prisma.dishAlias.update({
    where: { id: alias.id },
    data: { recipeId: recipe.id, ignored: false },
  });

  if (moverVentas) {
    const filas = await prisma.importRow.findMany({
      where: {
        normalizedName: alias.normalizedName,
        status: "MATCHED",
        date: { not: null },
        importBatch: { sucursalId: user.sucursalId },
      },
      orderBy: { createdAt: "asc" },
      select: { date: true, quantitySold: true, unitPrice: true, importBatchId: true },
    });

    // Si el mismo nombre aparece dos veces en la misma fecha, gana la ultima: es la misma regla
    // que usa la importacion al guardar la venta del dia.
    const porFecha = new Map<string, (typeof filas)[number]>();
    for (const fila of filas) porFecha.set(fila.date!.toISOString(), fila);

    for (const fila of porFecha.values()) {
      const date = fila.date!;
      await prisma.dailySale.upsert({
        where: {
          organizationId_recipeId_date: {
            organizationId: user.organizationId,
            recipeId: recipe.id,
            date,
          },
        },
        create: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          recipeId: recipe.id,
          date,
          quantitySold: fila.quantitySold.toString(),
          unitPrice: fila.unitPrice.toString(),
          source: "import",
          importBatchId: fila.importBatchId,
        },
        update: {
          quantitySold: fila.quantitySold.toString(),
          unitPrice: fila.unitPrice.toString(),
          source: "import",
          importBatchId: fila.importBatchId,
        },
      });

      // La venta del platillo anterior se borra solo si ningun otro nombre la alimentaba ese
      // dia: dos nombres distintos pueden caer en el mismo platillo.
      if (anterior) {
        const otros = await prisma.importRow.count({
          where: {
            matchedRecipeId: anterior,
            status: "MATCHED",
            date,
            normalizedName: { not: alias.normalizedName },
            importBatch: { sucursalId: user.sucursalId },
          },
        });
        if (otros === 0) {
          await prisma.dailySale.deleteMany({
            where: {
              organizationId: user.organizationId,
              recipeId: anterior,
              date,
              source: "import",
            },
          });
        }
      }
    }

    await prisma.importRow.updateMany({
      where: {
        normalizedName: alias.normalizedName,
        status: "MATCHED",
        importBatch: { sucursalId: user.sucursalId },
      },
      data: { matchedRecipeId: recipe.id },
    });
  }

  revalidatePath("/sales/aliases");
  revalidatePath("/sales");
}

/** Marca un nombre como "nunca es un platillo" (propinas, descuentos) o lo regresa a la lista. */
export async function setAliasIgnored(aliasId: string, ignored: boolean) {
  const user = await requireSucursalContext();
  const alias = await getAlias(aliasId, user.sucursalId);

  await prisma.dishAlias.update({
    where: { id: alias.id },
    data: { ignored, ...(ignored ? { recipeId: null } : {}) },
  });

  revalidatePath("/sales/aliases");
}

/**
 * Borra la vinculacion. Las ventas ya importadas no se tocan: la proxima importacion va a
 * volver a preguntar que hacer con ese nombre.
 */
export async function deleteAlias(aliasId: string) {
  const user = await requireSucursalContext();
  const alias = await getAlias(aliasId, user.sucursalId);

  await prisma.dishAlias.delete({ where: { id: alias.id } });

  revalidatePath("/sales/aliases");
}
