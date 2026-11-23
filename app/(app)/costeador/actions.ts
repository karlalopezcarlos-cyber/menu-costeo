"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNITS, type UnitValue } from "@/lib/units";

/** Igual que en Recetas: una unidad que no esta en el catalogo no se guarda en silencio. */
function parseUnit(value: FormDataEntryValue | null): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

/** Que la propuesta sea de esta sucursal. Se revisa en cada accion, no solo al pintar. */
async function propuestaDeLaSucursal(costeadorId: string) {
  const user = await requireSucursalContext();
  const propuesta = await prisma.costeador.findFirst({
    where: { id: costeadorId, sucursalId: user.sucursalId },
    select: { id: true, transferredAt: true, name: true },
  });
  if (!propuesta) throw new Error("Propuesta no encontrada.");
  return { user, propuesta };
}

export async function createCosteador(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let nuevoId: string;
  try {
    const user = await requireSucursalContext();

    const name = String(formData.get("name") ?? "").trim();
    const yieldQty = new Decimal(String(formData.get("yieldQty") ?? "0"));
    const yieldUnit = parseUnit(formData.get("yieldUnit"));
    const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
    const sellingPriceRaw = String(formData.get("sellingPrice") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!name) throw new Error("Ponle nombre a la propuesta.");
    if (!yieldQty.isFinite() || yieldQty.lte(0)) {
      throw new Error("El rendimiento debe ser mayor a cero.");
    }

    // A diferencia de una receta, aqui NO se rechaza un nombre repetido. Probar tres versiones
    // del mismo coctel es justo para lo que sirve esto, y obligar a inventarles nombre
    // distinto solo estorbaria.
    const creada = await prisma.costeador.create({
      data: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        name,
        categoryId,
        yieldQty: yieldQty.toString(),
        yieldUnit,
        isMenuItem: formData.get("isMenuItem") !== "off",
        sellingPrice: sellingPriceRaw ? new Decimal(sellingPriceRaw).toString() : null,
        notes,
        createdByUserId: user.id,
      },
    });
    nuevoId = creada.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear la propuesta." };
  }

  revalidatePath("/costeador");
  redirect(`/costeador/${nuevoId}`);
}

export async function updateCosteador(
  costeadorId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const { propuesta } = await propuestaDeLaSucursal(costeadorId);

    const name = String(formData.get("name") ?? "").trim();
    const yieldQty = new Decimal(String(formData.get("yieldQty") ?? "0"));
    const sellingPriceRaw = String(formData.get("sellingPrice") ?? "").trim();

    if (!name) throw new Error("El nombre no puede quedar vacio.");
    if (!yieldQty.isFinite() || yieldQty.lte(0)) {
      throw new Error("El rendimiento debe ser mayor a cero.");
    }

    await prisma.costeador.update({
      where: { id: propuesta.id },
      data: {
        name,
        yieldQty: yieldQty.toString(),
        yieldUnit: parseUnit(formData.get("yieldUnit")),
        categoryId: String(formData.get("categoryId") ?? "").trim() || null,
        isMenuItem: formData.get("isMenuItem") === "on",
        sellingPrice: sellingPriceRaw ? new Decimal(sellingPriceRaw).toString() : null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar." };
  }

  revalidatePath(`/costeador/${costeadorId}`);
  revalidatePath("/costeador");
  return {};
}

export async function addCosteadorItem(
  costeadorId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const { user, propuesta } = await propuestaDeLaSucursal(costeadorId);

    const tipo = String(formData.get("componentType") ?? "product");
    const productId = String(formData.get("productId") ?? "").trim() || null;
    const subRecipeId = String(formData.get("subRecipeId") ?? "").trim() || null;
    const quantity = new Decimal(String(formData.get("quantity") ?? "0"));

    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new Error("La cantidad debe ser mayor a cero.");
    }

    if (tipo === "product") {
      if (!productId) throw new Error("Elige un producto.");
      const existe = await prisma.product.findFirst({
        where: { id: productId, organizationId: user.organizationId, archivedAt: null },
        select: { id: true },
      });
      if (!existe) throw new Error("Producto no encontrado.");
    } else {
      if (!subRecipeId) throw new Error("Elige una subreceta.");
      // De esta sucursal: costear con una subreceta de otra daria un numero que no se puede
      // reproducir aqui, porque sus insumos tienen otro costo.
      const existe = await prisma.recipe.findFirst({
        where: { id: subRecipeId, sucursalId: user.sucursalId, archivedAt: null },
        select: { id: true },
      });
      if (!existe) throw new Error("Subreceta no encontrada en esta sucursal.");
    }

    const ultimo = await prisma.costeadorItem.findFirst({
      where: { costeadorId: propuesta.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    await prisma.costeadorItem.create({
      data: {
        costeadorId: propuesta.id,
        productId: tipo === "product" ? productId : null,
        subRecipeId: tipo === "product" ? null : subRecipeId,
        quantity: quantity.toString(),
        unit: parseUnit(formData.get("unit")),
        sortOrder: (ultimo?.sortOrder ?? 0) + 1,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar." };
  }

  revalidatePath(`/costeador/${costeadorId}`);
  return {};
}

export async function updateCosteadorItemQuantity(
  itemId: string,
  value: string,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();
  const item = await prisma.costeadorItem.findFirst({
    where: { id: itemId, costeador: { sucursalId: user.sucursalId } },
    select: { id: true, costeadorId: true },
  });
  if (!item) return { error: "Ingrediente no encontrado." };

  const quantity = new Decimal(value || "0");
  if (!quantity.isFinite() || quantity.lte(0)) {
    return { error: "La cantidad debe ser mayor a cero." };
  }

  await prisma.costeadorItem.update({
    where: { id: item.id },
    data: { quantity: quantity.toString() },
  });

  revalidatePath(`/costeador/${item.costeadorId}`);
  return {};
}

export async function deleteCosteadorItem(itemId: string) {
  const user = await requireSucursalContext();
  const item = await prisma.costeadorItem.findFirst({
    where: { id: itemId, costeador: { sucursalId: user.sucursalId } },
    select: { id: true, costeadorId: true },
  });
  if (!item) throw new Error("Ingrediente no encontrado.");

  await prisma.costeadorItem.delete({ where: { id: item.id } });
  revalidatePath(`/costeador/${item.costeadorId}`);
}

export async function deleteCosteador(costeadorId: string) {
  const { propuesta } = await propuestaDeLaSucursal(costeadorId);
  // Los ingredientes se van con ella por cascada. Nada mas depende de una propuesta: si ya se
  // transfirio, la receta creada vive por su cuenta y no se entera.
  await prisma.costeador.delete({ where: { id: propuesta.id } });

  revalidatePath("/costeador");
  redirect("/costeador");
}

/**
 * Autorizada: la propuesta se convierte en receta de verdad.
 *
 * Es una copia, no una mudanza. La propuesta se queda con la liga a la receta creada, porque es
 * el costeo con el que se tomo la decision -con que precios, con que rendimiento, quien lo
 * presento- y eso es justo lo que despues nadie encuentra.
 *
 * No clona a las demas sucursales por su cuenta, a diferencia de crear una receta desde cero.
 * Autorizar un platillo en una sucursal no significa autorizarlo en todas, y meterlo solo en
 * las demas seria tomar una decision que no es de esta pantalla.
 */
export async function transferirAReceta(
  costeadorId: string,
  _prevState: { error?: string } | undefined,
): Promise<{ error?: string }> {
  let recipeId: string;
  try {
    const user = await requireSucursalContext();

    const propuesta = await prisma.costeador.findFirst({
      where: { id: costeadorId, sucursalId: user.sucursalId },
      include: { items: true },
    });
    if (!propuesta) throw new Error("Propuesta no encontrada.");
    if (propuesta.recipeId) {
      throw new Error("Esta propuesta ya se transfirio a Recetas.");
    }
    if (propuesta.items.length === 0) {
      throw new Error("La propuesta no tiene ingredientes: no hay nada que transferir.");
    }

    // Aqui si estorba un nombre repetido: en Recetas el nombre es la llave con la que se cruzan
    // las ventas del POS, y dos recetas iguales parten ese cruce en dos.
    const duplicada = await prisma.recipe.findFirst({
      where: { sucursalId: user.sucursalId, name: { equals: propuesta.name, mode: "insensitive" } },
      select: { name: true, archivedAt: true },
    });
    if (duplicada) {
      throw new Error(
        duplicada.archivedAt
          ? `Ya existe una receta archivada llamada "${duplicada.name}". Cambiale el nombre a la propuesta o desarchiva esa receta.`
          : `Ya existe una receta llamada "${duplicada.name}". Cambiale el nombre a la propuesta antes de transferirla.`,
      );
    }

    // Todo o nada: una receta a la que le falten ingredientes porque se cayo a medio camino es
    // peor que una que no se creo, porque parece completa.
    const creada = await prisma.$transaction(async (tx) => {
      const receta = await tx.recipe.create({
        data: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          name: propuesta.name,
          categoryId: propuesta.categoryId,
          yieldQty: propuesta.yieldQty.toString(),
          yieldUnit: propuesta.yieldUnit,
          isMenuItem: propuesta.isMenuItem,
          sellingPrice: propuesta.sellingPrice?.toString() ?? null,
          instructions: propuesta.notes,
          items: {
            create: propuesta.items.map((item) => ({
              productId: item.productId,
              subRecipeId: item.subRecipeId,
              quantity: item.quantity.toString(),
              unit: item.unit,
              sortOrder: item.sortOrder,
            })),
          },
        },
      });

      await tx.costeador.update({
        where: { id: propuesta.id },
        data: { recipeId: receta.id, transferredAt: new Date() },
      });

      return receta;
    });

    await prisma.recipeActivity.create({
      data: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        recipeId: creada.id,
        type: "CREATED",
        message: `Receta creada desde el Costeador (propuesta "${propuesta.name}")`,
        createdByUserId: user.id,
      },
    });

    recipeId = creada.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo transferir." };
  }

  revalidatePath("/costeador");
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}
