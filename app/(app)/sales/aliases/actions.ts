"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { recomputeDailySale } from "@/lib/import-processing";

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
    // Las fechas se sacan ANTES de reapuntar los renglones, para saber que dias hay que rearmar
    // en los dos platillos: el nuevo y el que se queda sin esas ventas.
    const fechas = await prisma.importRow.findMany({
      where: {
        normalizedName: alias.normalizedName,
        status: "MATCHED",
        date: { not: null },
        importBatch: { sucursalId: user.sucursalId },
      },
      select: { date: true },
      distinct: ["date"],
    });

    await prisma.importRow.updateMany({
      where: {
        normalizedName: alias.normalizedName,
        status: "MATCHED",
        importBatch: { sucursalId: user.sucursalId },
      },
      data: { matchedRecipeId: recipe.id },
    });

    // Rearmar cada dia desde los renglones deja todo cuadrado solo: el platillo nuevo suma lo
    // que le llega, y el anterior se queda con lo que le siga entrando de otros nombres, o sin
    // venta si ya no le entra nada.
    for (const { date } of fechas) {
      if (!date) continue;
      await recomputeDailySale(user.organizationId, user.sucursalId, recipe.id, date);
      if (anterior && anterior !== recipe.id) {
        await recomputeDailySale(user.organizationId, user.sucursalId, anterior, date);
      }
    }
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

/**
 * Rearma de una vez todas las ventas importadas de la sucursal.
 *
 * Sirve para reparar lo que ya se importo cuando dos nombres caian en el mismo platillo el mismo
 * dia: antes el segundo pisaba al primero y esas ventas se perdieron. Esto las devuelve sumando
 * los renglones de los archivos originales, que si quedaron guardados.
 *
 * Se hace en memoria y de corrido —una lectura, escrituras por lotes— porque recalcular dia por
 * dia con una consulta cada uno no aguanta un ano de ventas.
 */
export async function recomputeAllImportedSales(): Promise<{
  revisados: number;
  corregidos: number;
}> {
  const user = await requireSucursalContext();

  const filas = await prisma.importRow.findMany({
    where: {
      status: "MATCHED",
      date: { not: null },
      matchedRecipeId: { not: null },
      importBatch: { sucursalId: user.sucursalId },
    },
    select: {
      matchedRecipeId: true,
      date: true,
      quantitySold: true,
      unitPrice: true,
      importBatchId: true,
      importBatch: { select: { createdAt: true } },
    },
  });

  type Acumulado = {
    recipeId: string;
    date: Date;
    batchId: string;
    batchCreatedAt: Date;
    cantidad: Decimal;
    dinero: Decimal;
  };
  const porPlatilloYDia = new Map<string, Acumulado>();

  for (const fila of filas) {
    const recipeId = fila.matchedRecipeId!;
    const date = fila.date!;
    const clave = `${recipeId}|${date.toISOString()}`;
    const qty = new Decimal(fila.quantitySold.toString());
    const dinero = qty.times(new Decimal(fila.unitPrice.toString()));
    const actual = porPlatilloYDia.get(clave);

    if (!actual) {
      porPlatilloYDia.set(clave, {
        recipeId,
        date,
        batchId: fila.importBatchId,
        batchCreatedAt: fila.importBatch.createdAt,
        cantidad: qty,
        dinero,
      });
      continue;
    }

    // Misma regla que al importar: solo cuenta la importacion mas reciente que traiga ese dia.
    // Una mas nueva reemplaza lo acumulado; una mas vieja no se suma encima.
    if (fila.importBatch.createdAt > actual.batchCreatedAt) {
      actual.batchId = fila.importBatchId;
      actual.batchCreatedAt = fila.importBatch.createdAt;
      actual.cantidad = qty;
      actual.dinero = dinero;
    } else if (fila.importBatchId === actual.batchId) {
      actual.cantidad = actual.cantidad.plus(qty);
      actual.dinero = actual.dinero.plus(dinero);
    }
  }

  const existentes = await prisma.dailySale.findMany({
    where: { sucursalId: user.sucursalId, source: "import" },
    select: { id: true, recipeId: true, date: true, quantitySold: true, unitPrice: true },
  });
  const existentePorClave = new Map(
    existentes.map((v) => [`${v.recipeId}|${v.date.toISOString()}`, v]),
  );

  const porCrear: {
    organizationId: string;
    sucursalId: string;
    recipeId: string;
    date: Date;
    quantitySold: string;
    unitPrice: string;
    source: string;
    importBatchId: string;
  }[] = [];
  const porActualizar: { id: string; quantitySold: string; unitPrice: string; importBatchId: string }[] = [];

  for (const [clave, acumulado] of porPlatilloYDia) {
    const cantidad = acumulado.cantidad;
    const precio = cantidad.isZero()
      ? new Decimal(0)
      : acumulado.dinero.dividedBy(cantidad).toDecimalPlaces(2);
    const existente = existentePorClave.get(clave);

    if (!existente) {
      porCrear.push({
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        recipeId: acumulado.recipeId,
        date: acumulado.date,
        quantitySold: cantidad.toString(),
        unitPrice: precio.toString(),
        source: "import",
        importBatchId: acumulado.batchId,
      });
      continue;
    }

    const mismaCantidad = new Decimal(existente.quantitySold.toString()).equals(cantidad);
    const mismoPrecio = new Decimal(existente.unitPrice.toString()).equals(precio);
    if (mismaCantidad && mismoPrecio) continue;

    porActualizar.push({
      id: existente.id,
      quantitySold: cantidad.toString(),
      unitPrice: precio.toString(),
      importBatchId: acumulado.batchId,
    });
  }

  if (porCrear.length > 0) {
    await prisma.dailySale.createMany({ data: porCrear, skipDuplicates: true });
  }

  const TAMANO_LOTE = 25;
  for (let i = 0; i < porActualizar.length; i += TAMANO_LOTE) {
    const lote = porActualizar.slice(i, i + TAMANO_LOTE);
    await prisma.$transaction(
      lote.map((v) =>
        prisma.dailySale.update({
          where: { id: v.id },
          data: {
            quantitySold: v.quantitySold,
            unitPrice: v.unitPrice,
            importBatchId: v.importBatchId,
          },
        }),
      ),
    );
  }

  revalidatePath("/sales");
  revalidatePath("/sales/aliases");

  return { revisados: porPlatilloYDia.size, corregidos: porCrear.length + porActualizar.length };
}
