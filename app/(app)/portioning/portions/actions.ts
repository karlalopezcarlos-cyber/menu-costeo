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
 * Todo lo que sale de una transformacion es un producto mas del catalogo: el granel ya
 * habilitado (CAMARON SIN CASCARA KG) y las porciones (CAMARON 20 G). Los dos se dan de alta
 * aqui, porque los dos tienen lo mismo en comun: su costo no sale de una compra sino de lo que
 * entro entre lo que salio.
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
  baseUnit: UnitValue;
  portionQty: string | null;
  portionUnit: UnitValue | null;
  extrasRecipeId: string | null;
  categoryId: string | null;
  defaultSourceProductId: string | null;
} {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle nombre al producto (ej. CAMARON 20 G, CAMARON SIN CASCARA KG).");

  const baseUnitRaw = String(formData.get("baseUnit") ?? "");
  if (!(UNITS as readonly string[]).includes(baseUnitRaw)) {
    throw new Error("Elige en que se cuenta este producto.");
  }

  // El peso por unidad es opcional a proposito: nadie tiene que saber de antemano cuanto rinde
  // un kilo. Un granel no lo necesita (un kilo limpio es un kilo), y una porcion solo lo usa
  // para repartir el costo cuando de la misma tanda salen varios tamanos.
  const portionQtyRaw = String(formData.get("portionQty") ?? "").trim();
  const portionUnitRaw = String(formData.get("portionUnit") ?? "");
  let portionQty: string | null = null;
  let portionUnit: UnitValue | null = null;
  if (portionQtyRaw) {
    const qty = new Decimal(portionQtyRaw);
    if (qty.lte(0)) throw new Error("Lo que lleva cada unidad debe ser mayor a cero.");
    if (!(UNITS as readonly string[]).includes(portionUnitRaw)) {
      throw new Error("Elige la unidad de lo que lleva cada unidad.");
    }
    portionQty = qty.toString();
    portionUnit = portionUnitRaw as UnitValue;
  }

  return {
    name,
    baseUnit: baseUnitRaw as UnitValue,
    portionQty,
    portionUnit,
    extrasRecipeId: String(formData.get("extrasRecipeId") ?? "").trim() || null,
    categoryId: String(formData.get("categoryId") ?? "").trim() || null,
    defaultSourceProductId: String(formData.get("defaultSourceProductId") ?? "").trim() || null,
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
        // Su costo lo pone la transformacion, no una compra: por eso no aparece en Compras.
        baseUnit: datos.baseUnit,
        isProcessed: true,
        yieldPercentage: "100",
        portionQty: datos.portionQty,
        portionUnit: datos.portionUnit,
        extrasRecipeId: datos.extrasRecipeId,
        defaultSourceProductId: datos.defaultSourceProductId,
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
        baseUnit: datos.baseUnit,
        portionQty: datos.portionQty,
        portionUnit: datos.portionUnit,
        extrasRecipeId: datos.extrasRecipeId,
        defaultSourceProductId: datos.defaultSourceProductId,
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
