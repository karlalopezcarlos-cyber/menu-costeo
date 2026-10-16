"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNITS, type UnitValue } from "@/lib/units";
import { Prisma } from "@/generated/prisma/client";

export type PortionState = { error?: string };

/**
 * Una porcion es un producto mas del catalogo (CAMARON 20 G), no una receta.
 *
 * Esa es la diferencia de fondo con la version anterior: como producto, su costo lo fija la
 * transformacion del dia —lo que entro entre lo que salio— igual que pasa con CAMARON LIMPIO.
 * Asi un mal corte encarece esas piezas y nada mas esas, en vez de reescribir el rendimiento
 * del producto de origen y recostear su historial completo.
 *
 * El peso por porcion que se guarda aqui no es una restriccion: sirve para repartir el costo
 * cuando de una misma tanda salen varios tamanos, y para prellenar la captura.
 */
function parsePortion(formData: FormData): {
  name: string;
  portionQty: string;
  portionUnit: UnitValue;
  extrasRecipeId: string | null;
  categoryId: string | null;
} {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle nombre a la porcion (ej. CAMARON 20 G).");

  const portionUnitRaw = String(formData.get("portionUnit") ?? "");
  if (!(UNITS as readonly string[]).includes(portionUnitRaw)) {
    throw new Error("Elige la unidad en la que mides la porcion.");
  }

  const portionQty = new Decimal(String(formData.get("portionQty") ?? "0") || "0");
  if (portionQty.lte(0)) {
    throw new Error("Captura cuanto producto lleva una porcion (ej. 20 gramos).");
  }

  return {
    name,
    portionQty: portionQty.toString(),
    portionUnit: portionUnitRaw as UnitValue,
    extrasRecipeId: String(formData.get("extrasRecipeId") ?? "").trim() || null,
    categoryId: String(formData.get("categoryId") ?? "").trim() || null,
  };
}

export async function createPortion(
  _prevState: PortionState | undefined,
  formData: FormData,
): Promise<PortionState> {
  try {
    const user = await requireOrgSession();
    const datos = parsePortion(formData);

    await prisma.product.create({
      data: {
        organizationId: user.organizationId,
        name: datos.name,
        categoryId: datos.categoryId,
        // Las porciones se cuentan por pieza y su costo lo pone la transformacion, no una compra.
        baseUnit: "PIECE",
        isProcessed: true,
        yieldPercentage: "100",
        portionQty: datos.portionQty,
        portionUnit: datos.portionUnit,
        extrasRecipeId: datos.extrasRecipeId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un producto con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear la porcion." };
  }

  revalidatePath("/portioning/portions");
  revalidatePath("/products");
  redirect("/portioning/portions");
}

export async function updatePortion(
  productId: string,
  _prevState: PortionState | undefined,
  formData: FormData,
): Promise<PortionState> {
  try {
    const user = await requireOrgSession();
    const datos = parsePortion(formData);

    const existing = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
    });
    if (!existing) throw new Error("Porcion no encontrada.");

    await prisma.product.update({
      where: { id: productId },
      data: {
        name: datos.name,
        categoryId: datos.categoryId,
        portionQty: datos.portionQty,
        portionUnit: datos.portionUnit,
        extrasRecipeId: datos.extrasRecipeId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe un producto con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo guardar la porcion." };
  }

  revalidatePath("/portioning/portions");
  revalidatePath("/products");
  redirect("/portioning/portions");
}

/**
 * Archiva la porcion en vez de borrarla cuando ya se uso: su costo esta metido en
 * transformaciones y recetas pasadas, y borrarla dejaria huecos en el historial.
 */
export async function archivePortion(productId: string) {
  const user = await requireOrgSession();

  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId: user.organizationId },
  });
  if (!product) throw new Error("Porcion no encontrada.");

  const [usos, recetas] = await Promise.all([
    prisma.portioningOutput.count({ where: { productId } }),
    prisma.recipeItem.count({ where: { productId } }),
  ]);

  if (usos === 0 && recetas === 0) {
    await prisma.product.delete({ where: { id: productId } });
  } else {
    await prisma.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
  }

  revalidatePath("/portioning/portions");
  revalidatePath("/products");
}
