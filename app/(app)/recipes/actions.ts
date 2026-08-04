"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { loadOrgRecipeGraph, wouldCreateCycle } from "@/lib/costing";
import { logRecipeActivity, describeQuantity } from "@/lib/recipe-activity";

function parseUnit(value: FormDataEntryValue | null): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_SIZE = 4 * 1024 * 1024;

export async function createRecipe(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let recipeId: string;
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
    const yieldQty = new Decimal(String(formData.get("yieldQty") ?? "0"));
    const yieldUnit = parseUnit(formData.get("yieldUnit"));
    const isMenuItem = formData.get("isMenuItem") === "on";
    const sellingPriceRaw = String(formData.get("sellingPrice") ?? "").trim();

    if (!name) throw new Error("El nombre es obligatorio.");
    if (yieldQty.lte(0)) throw new Error("El rendimiento debe ser mayor a cero.");

    const duplicate = await prisma.recipe.findFirst({
      where: { organizationId: user.organizationId, name: { equals: name, mode: "insensitive" } },
    });
    if (duplicate) {
      throw new Error(
        duplicate.archivedAt
          ? `Ya existe una receta archivada llamada "${duplicate.name}".`
          : `Ya existe una receta llamada "${duplicate.name}".`,
      );
    }

    if (categoryId) {
      const category = await prisma.recipeCategory.findFirst({
        where: { id: categoryId, organizationId: user.organizationId },
      });
      if (!category) throw new Error("Categoria no encontrada.");
    }

    const recipe = await prisma.recipe.create({
      data: {
        organizationId: user.organizationId,
        name,
        categoryId,
        yieldQty: yieldQty.toString(),
        yieldUnit,
        isMenuItem,
        sellingPrice: sellingPriceRaw ? new Decimal(sellingPriceRaw).toString() : null,
      },
    });

    await logRecipeActivity({
      organizationId: user.organizationId,
      recipeId: recipe.id,
      type: "CREATED",
      message: `Receta creada`,
      createdByUserId: user.id,
    });

    recipeId = recipe.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear la receta." };
  }

  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}

export async function addRecipeItem(
  recipeId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const componentType = String(formData.get("componentType") ?? "");
    const quantity = new Decimal(String(formData.get("quantity") ?? "0"));
    const unit = parseUnit(formData.get("unit"));

    if (quantity.lte(0)) throw new Error("La cantidad debe ser mayor a cero.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, organizationId: user.organizationId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    if (componentType === "product") {
      const productId = String(formData.get("productId") ?? "");
      const product = await prisma.product.findFirst({
        where: { id: productId, organizationId: user.organizationId },
      });
      if (!product) throw new Error("Producto no encontrado.");

      // Si el producto ya esta en la receta, se sobrescribe cantidad/unidad del renglon existente
      // en vez de crear un duplicado.
      const existingItem = await prisma.recipeItem.findFirst({
        where: { recipeId: recipe.id, productId: product.id },
      });
      if (existingItem) {
        await prisma.recipeItem.update({
          where: { id: existingItem.id },
          data: { quantity: quantity.toString(), unit },
        });
      } else {
        await prisma.recipeItem.create({
          data: { recipeId: recipe.id, productId: product.id, quantity: quantity.toString(), unit },
        });
      }

      await logRecipeActivity({
        organizationId: user.organizationId,
        recipeId: recipe.id,
        type: "ITEM_ADDED",
        message: existingItem
          ? `Se cambio "${product.name}" de ${describeQuantity(existingItem.quantity, existingItem.unit as UnitValue)} a ${describeQuantity(quantity, unit)}`
          : `Se agrego "${product.name}" (${quantity.toString()} ${UNIT_LABELS[unit]})`,
        createdByUserId: user.id,
      });
    } else if (componentType === "subrecipe") {
      const subRecipeId = String(formData.get("subRecipeId") ?? "");
      const subRecipe = await prisma.recipe.findFirst({
        where: { id: subRecipeId, organizationId: user.organizationId },
      });
      if (!subRecipe) throw new Error("Subreceta no encontrada.");

      const graph = await loadOrgRecipeGraph(user.organizationId);
      if (wouldCreateCycle(recipe.id, subRecipe.id, graph)) {
        throw new Error(
          `No se puede agregar "${subRecipe.name}": crearia una referencia circular de subrecetas.`,
        );
      }

      const existingSubItem = await prisma.recipeItem.findFirst({
        where: { recipeId: recipe.id, subRecipeId: subRecipe.id },
      });
      if (existingSubItem) {
        await prisma.recipeItem.update({
          where: { id: existingSubItem.id },
          data: { quantity: quantity.toString(), unit },
        });
      } else {
        await prisma.recipeItem.create({
          data: { recipeId: recipe.id, subRecipeId: subRecipe.id, quantity: quantity.toString(), unit },
        });
      }

      await logRecipeActivity({
        organizationId: user.organizationId,
        recipeId: recipe.id,
        type: "ITEM_ADDED",
        message: existingSubItem
          ? `Se cambio la subreceta "${subRecipe.name}" de ${describeQuantity(existingSubItem.quantity, existingSubItem.unit as UnitValue)} a ${describeQuantity(quantity, unit)}`
          : `Se agrego la subreceta "${subRecipe.name}" (${quantity.toString()} ${UNIT_LABELS[unit]})`,
        createdByUserId: user.id,
      });
    } else {
      throw new Error("Tipo de ingrediente invalido.");
    }

    revalidatePath(`/recipes/${recipeId}`);
    revalidatePath(`/recipes/${recipeId}/activity`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Error al agregar el ingrediente." };
  }
}

export async function removeRecipeItem(recipeId: string, itemId: string) {
  const user = await requireOrgSession();

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: user.organizationId },
  });
  if (!recipe) throw new Error("Receta no encontrada.");

  const item = await prisma.recipeItem.findFirst({
    where: { id: itemId, recipeId: recipe.id },
    include: { product: true, subRecipe: true },
  });
  if (!item) throw new Error("Ingrediente no encontrado.");

  await prisma.recipeItem.delete({ where: { id: item.id } });

  const label = item.product?.name ?? item.subRecipe?.name ?? "ingrediente";
  const kind = item.subRecipeId ? "la subreceta " : "";
  await logRecipeActivity({
    organizationId: user.organizationId,
    recipeId: recipe.id,
    type: "ITEM_REMOVED",
    message: `Se quito ${kind}"${label}" (${item.quantity.toString()} ${UNIT_LABELS[item.unit as UnitValue]})`,
    createdByUserId: user.id,
  });

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath(`/recipes/${recipeId}/activity`);
}

export async function updateRecipeDetails(
  recipeId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    const yieldQty = new Decimal(String(formData.get("yieldQty") ?? "0"));
    const yieldUnit = parseUnit(formData.get("yieldUnit"));

    if (!name) throw new Error("El nombre es obligatorio.");
    if (yieldQty.lte(0)) throw new Error("El rendimiento debe ser mayor a cero.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, organizationId: user.organizationId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const duplicate = await prisma.recipe.findFirst({
      where: {
        organizationId: user.organizationId,
        name: { equals: name, mode: "insensitive" },
        id: { not: recipeId },
      },
    });
    if (duplicate) throw new Error(`Ya existe otra receta llamada "${duplicate.name}".`);

    const changes: string[] = [];
    if (recipe.name !== name) changes.push(`el nombre de "${recipe.name}" a "${name}"`);
    if (!recipe.yieldQty.equals(yieldQty) || recipe.yieldUnit !== yieldUnit) {
      changes.push(
        `el rendimiento de ${recipe.yieldQty.toString()} ${UNIT_LABELS[recipe.yieldUnit as UnitValue]} a ${yieldQty.toString()} ${UNIT_LABELS[yieldUnit]}`,
      );
    }

    await prisma.recipe.update({
      where: { id: recipeId },
      data: { name, yieldQty: yieldQty.toString(), yieldUnit },
    });

    if (changes.length > 0) {
      await logRecipeActivity({
        organizationId: user.organizationId,
        recipeId,
        type: "UPDATED",
        message: `Se actualizo ${changes.join(" y ")}`,
        createdByUserId: user.id,
      });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la receta." };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath(`/recipes/${recipeId}/activity`);
  revalidatePath("/recipes");
  return {};
}

export async function updateRecipeInstructions(recipeId: string, formData: FormData) {
  const user = await requireOrgSession();

  const instructions = String(formData.get("instructions") ?? "").trim();

  await prisma.recipe.update({
    where: { id: recipeId, organizationId: user.organizationId },
    data: { instructions: instructions || null },
  });

  revalidatePath(`/recipes/${recipeId}`);
}

export async function archiveRecipe(recipeId: string) {
  const user = await requireOrgSession();

  await prisma.recipe.update({
    where: { id: recipeId, organizationId: user.organizationId },
    data: { archivedAt: new Date() },
  });

  await logRecipeActivity({
    organizationId: user.organizationId,
    recipeId,
    type: "ARCHIVED",
    message: "Receta archivada",
    createdByUserId: user.id,
  });

  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function updateRecipePhoto(
  recipeId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, organizationId: user.organizationId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona una imagen.");
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      throw new Error("La imagen debe ser JPG, PNG o WEBP.");
    }
    if (file.size > MAX_PHOTO_SIZE) {
      throw new Error("La imagen no debe pesar mas de 4MB.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { photo: buffer, photoMimeType: file.type },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la foto." };
  }

  revalidatePath(`/recipes/${recipeId}`);
  return {};
}

export async function removeRecipePhoto(recipeId: string) {
  const user = await requireOrgSession();

  await prisma.recipe.update({
    where: { id: recipeId, organizationId: user.organizationId },
    data: { photo: null, photoMimeType: null },
  });

  revalidatePath(`/recipes/${recipeId}`);
}
