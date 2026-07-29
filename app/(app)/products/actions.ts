"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import {
  applyYieldFactor,
  computeUnitCost,
  UNIT_LABELS,
  UNIT_META,
  UNITS,
  type UnitValue,
} from "@/lib/units";
import { recalcProductCurrentCost } from "@/lib/costing";
import { Prisma } from "@/generated/prisma/client";

function parseUnit(value: FormDataEntryValue | null): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

function parseYieldPercentage(value: FormDataEntryValue | null): Decimal {
  const raw = String(value ?? "100").trim();
  const pct = new Decimal(raw || "100");
  if (pct.lte(0) || pct.gt(100)) {
    throw new Error("El rendimiento debe ser mayor a 0% y hasta 100%.");
  }
  return pct;
}

function parseCategoryId(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

/**
 * Presentacion de compra fija opcional (ej. "Botella" = 750 ML). Si el usuario capturo
 * cualquiera de los dos campos, exige ambos completos y validos; si dejo ambos vacios,
 * el producto simplemente no usa esta funcion (se compra/cuenta directo en la unidad base).
 */
function parsePresentationUnit(formData: FormData): { label: string | null; qty: string | null } {
  const label = String(formData.get("presentationUnitLabel") ?? "").trim();
  const qtyRaw = String(formData.get("presentationUnitQty") ?? "").trim();

  if (!label && !qtyRaw) return { label: null, qty: null };

  if (!label) throw new Error("Indica el nombre de la presentacion de compra (ej. Botella).");
  const qty = new Decimal(qtyRaw || "0");
  if (qty.lte(0)) {
    throw new Error(`El contenido de "${label}" debe ser mayor a cero.`);
  }
  return { label, qty: qty.toString() };
}

/** Busca un producto con el mismo nombre (sin distinguir mayusculas/minusculas), activo o archivado. */
async function findDuplicateByName(organizationId: string, name: string, excludeProductId?: string) {
  return prisma.product.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    },
  });
}

function duplicateNameError(name: string, archivedAt: Date | null): string {
  if (archivedAt) {
    return `Ya existe un producto archivado llamado "${name}". Ve a Productos > Ver archivados para restaurarlo en vez de crear uno nuevo.`;
  }
  return `Ya existe un producto activo llamado "${name}".`;
}

export async function createProduct(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    const categoryId = parseCategoryId(formData.get("categoryId"));
    const baseUnit = parseUnit(formData.get("baseUnit"));
    const yieldPercentage = parseYieldPercentage(formData.get("yieldPercentage"));
    const presentation = parsePresentationUnit(formData);

    if (!name) throw new Error("El nombre es obligatorio.");

    const duplicate = await findDuplicateByName(user.organizationId, name);
    if (duplicate) throw new Error(duplicateNameError(duplicate.name, duplicate.archivedAt));

    if (categoryId) {
      const category = await prisma.productCategory.findFirst({
        where: { id: categoryId, organizationId: user.organizationId },
      });
      if (!category) throw new Error("Categoria no encontrada.");
    }

    await prisma.product.create({
      data: {
        organizationId: user.organizationId,
        name,
        categoryId,
        baseUnit,
        yieldPercentage: yieldPercentage.toString(),
        presentationUnitLabel: presentation.label,
        presentationUnitQty: presentation.qty,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el producto." };
  }

  revalidatePath("/products");
  redirect("/products");
}

export async function updateProduct(
  productId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const name = String(formData.get("name") ?? "").trim();
    const categoryId = parseCategoryId(formData.get("categoryId"));
    const baseUnit = parseUnit(formData.get("baseUnit"));
    const yieldPercentage = parseYieldPercentage(formData.get("yieldPercentage"));
    const presentation = parsePresentationUnit(formData);
    if (!name) throw new Error("El nombre es obligatorio.");

    const existing = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
    });
    if (!existing) throw new Error("Producto no encontrado.");

    const duplicate = await findDuplicateByName(user.organizationId, name, productId);
    if (duplicate) throw new Error(duplicateNameError(duplicate.name, duplicate.archivedAt));

    if (categoryId) {
      const category = await prisma.productCategory.findFirst({
        where: { id: categoryId, organizationId: user.organizationId },
      });
      if (!category) throw new Error("Categoria no encontrada.");
    }

    const baseUnitChanged = baseUnit !== existing.baseUnit;

    if (baseUnitChanged) {
      const purchases = await prisma.purchase.findMany({ where: { productId } });
      const incompatiblePurchase = purchases.find(
        (p) => UNIT_META[p.presentationUnit as UnitValue].type !== UNIT_META[baseUnit].type,
      );
      if (incompatiblePurchase) {
        throw new Error(
          `No se puede cambiar la unidad base a ${UNIT_LABELS[baseUnit]}: hay compras registradas en ${UNIT_LABELS[incompatiblePurchase.presentationUnit as UnitValue]}, que no se puede convertir a ese tipo de unidad. Archiva el producto y crea uno nuevo si necesitas cambiar de masa a volumen (o viceversa).`,
        );
      }

      // Todas las compras historicas quedaron expresadas en la unidad base anterior;
      // se recalculan contra la nueva para que el costo siga siendo correcto.
      await prisma.$transaction(
        purchases.map((p) => {
          const grossCost = computeUnitCost(
            p.totalPrice,
            p.presentationQty,
            p.presentationUnit as UnitValue,
            baseUnit,
          );
          const newCost = applyYieldFactor(grossCost, yieldPercentage);
          return prisma.purchase.update({
            where: { id: p.id },
            data: { computedUnitCost: newCost.toString() },
          });
        }),
      );

      // Los ingredientes de receta que usaban una unidad incompatible con la nueva unidad base
      // (ej. litros cuando el producto ahora es de masa) se reasignan a la nueva unidad base.
      const items = await prisma.recipeItem.findMany({ where: { productId } });
      const itemsToFix = items.filter(
        (item) => UNIT_META[item.unit as UnitValue].type !== UNIT_META[baseUnit].type,
      );
      if (itemsToFix.length) {
        await prisma.$transaction(
          itemsToFix.map((item) =>
            prisma.recipeItem.update({ where: { id: item.id }, data: { unit: baseUnit } }),
          ),
        );
      }
    }

    await prisma.product.update({
      where: { id: productId, organizationId: user.organizationId },
      data: {
        name,
        categoryId,
        baseUnit,
        yieldPercentage: yieldPercentage.toString(),
        presentationUnitLabel: presentation.label,
        presentationUnitQty: presentation.qty,
      },
    });

    if (baseUnitChanged) {
      await recalcProductCurrentCost(productId);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar el producto." };
  }

  revalidatePath("/products");
  revalidatePath("/purchases");
  revalidatePath("/recipes");
  redirect("/products");
}

export async function addProductPresentation(
  productId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
    });
    if (!product) throw new Error("Producto no encontrado.");

    const label = String(formData.get("label") ?? "").trim();
    if (!label) throw new Error("Indica el nombre de la presentacion (ej. Lata 2.75kg).");

    const unit = parseUnit(formData.get("unit"));
    if (UNIT_META[unit].type !== UNIT_META[product.baseUnit as UnitValue].type) {
      throw new Error(
        `La unidad no es compatible con la unidad base del producto (${UNIT_LABELS[product.baseUnit as UnitValue]}).`,
      );
    }

    const qty = new Decimal(String(formData.get("quantity") ?? "0"));
    if (qty.lte(0)) throw new Error(`La cantidad de "${label}" debe ser mayor a cero.`);

    await prisma.productPresentation.create({
      data: {
        organizationId: user.organizationId,
        productId: product.id,
        label,
        quantity: qty.toString(),
        unit,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una presentacion con ese nombre para este producto." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo agregar la presentacion." };
  }

  revalidatePath(`/products/${productId}/edit`);
  revalidatePath("/orders/new");
  revalidatePath("/purchases/new");
  revalidatePath("/inventory");
  return {};
}

export async function deleteProductPresentation(presentationId: string) {
  const user = await requireOrgSession();

  const presentation = await prisma.productPresentation.findFirst({
    where: { id: presentationId, organizationId: user.organizationId },
  });
  if (!presentation) throw new Error("Presentacion no encontrada.");

  await prisma.productPresentation.delete({ where: { id: presentation.id } });

  revalidatePath(`/products/${presentation.productId}/edit`);
  revalidatePath("/orders/new");
  revalidatePath("/purchases/new");
  revalidatePath("/inventory");
}

export async function archiveProduct(productId: string) {
  const user = await requireOrgSession();

  await prisma.product.update({
    where: { id: productId, organizationId: user.organizationId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/products");
}

export async function restoreProduct(productId: string) {
  const user = await requireOrgSession();

  await prisma.product.update({
    where: { id: productId, organizationId: user.organizationId },
    data: { archivedAt: null },
  });

  revalidatePath("/products");
}
