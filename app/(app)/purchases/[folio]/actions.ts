"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { applyYieldFactor, computeUnitCost, UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { recalcProductCurrentCost } from "@/lib/costing";
import { formatPurchaseFolio } from "@/lib/purchases/folio";
import { formatMoney } from "@/lib/format";

export type DeletePurchaseResult = { error?: string; paymentHref?: string };

/**
 * Antes de borrar una compra hay que asegurarse de que no tenga abonos registrados en Pagos --
 * SupplierPayment no tiene FK hacia Purchase (solo comparten el mismo numero de folio), asi que
 * borrar la compra sin este chequeo dejaria el abono huerfano (la compra desaparece pero el pago
 * sigue sumando en el saldo del proveedor, como paso con AMATTORA).
 */
async function findBlockingPayment(
  sucursalId: string,
  supplierId: string | null,
  folio: number,
): Promise<DeletePurchaseResult | null> {
  if (!supplierId) return null;

  const paid = await prisma.supplierPayment.aggregate({
    where: { sucursalId, supplierId, folio },
    _sum: { amount: true },
  });
  const amount = new Decimal(paid._sum.amount ?? 0);
  if (amount.lte(0)) return null;

  return {
    error: `Esta compra ya tiene ${formatMoney(amount.toNumber())} abonados en el folio de pagos ${formatPurchaseFolio(folio)}. Quita el pago en Pagos antes de eliminarla.`,
    paymentHref: `/payments/${supplierId}`,
  };
}

function parseUnit(value: unknown): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

export async function updatePurchase(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();
  const purchaseId = String(formData.get("purchaseId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "").trim() || null;

  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, sucursalId: user.sucursalId },
    include: { product: true },
  });
  if (!purchase) return { error: "Compra no encontrada." };

  try {
    const purchaseDateRaw = String(formData.get("purchaseDate") ?? "");
    if (!purchaseDateRaw) throw new Error("Indica la fecha de compra.");

    const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
    const supplierId = supplierIdRaw || null;
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId },
      });
      if (!supplier) throw new Error("Proveedor no encontrado.");
    }

    const presentationQty = new Decimal(String(formData.get("presentationQty") ?? "0"));
    if (presentationQty.lte(0)) throw new Error("La cantidad debe ser mayor a cero.");

    const presentationUnit = parseUnit(formData.get("presentationUnit"));

    const totalPrice = new Decimal(String(formData.get("totalPrice") ?? "0"));
    if (totalPrice.lte(0)) throw new Error("El precio debe ser mayor a cero.");

    const comment = String(formData.get("comment") ?? "").trim() || null;

    const grossUnitCost = computeUnitCost(
      totalPrice,
      presentationQty,
      presentationUnit,
      purchase.product.baseUnit as UnitValue,
    );
    const computedUnitCost = applyYieldFactor(grossUnitCost, purchase.product.yieldPercentage);

    // Si la cantidad/unidad no cambiaron, conservamos la etiqueta original (puede venir de una
    // presentacion configurada, ej. "1 COSTAL 25 KG") en vez de regenerar un texto generico.
    const qtyChanged = !presentationQty.equals(new Decimal(purchase.presentationQty));
    const unitChanged = presentationUnit !== purchase.presentationUnit;
    const presentationLabel =
      qtyChanged || unitChanged
        ? `${presentationQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[presentationUnit]}`
        : purchase.presentationLabel;

    await prisma.purchase.update({
      where: { id: purchase.id },
      data: {
        purchaseDate: new Date(purchaseDateRaw),
        supplierId,
        presentationQty: presentationQty.toString(),
        presentationUnit,
        presentationLabel,
        totalPrice: totalPrice.toString(),
        computedUnitCost: computedUnitCost.toString(),
        comment,
      },
    });

    await recalcProductCurrentCost(purchase.productId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la compra." };
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchase.folio}`);
  revalidatePath("/products");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);
  redirect(`/purchases/${purchase.folio}${recipeId ? `?recipeId=${recipeId}` : ""}`);
}

/** Agrega un producto nuevo a una compra ya existente, reusando su fecha y proveedor. */
export async function addPurchaseItem(
  folio: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();
  const recipeId = String(formData.get("recipeId") ?? "").trim() || null;

  const existing = await prisma.purchase.findFirst({
    where: { sucursalId: user.sucursalId, folio },
    orderBy: { createdAt: "asc" },
  });
  if (!existing) return { error: "Compra no encontrada." };

  try {
    const productId = String(formData.get("productId") ?? "").trim();
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
    });
    if (!product) throw new Error("Selecciona un producto valido.");

    const presentationQty = new Decimal(String(formData.get("presentationQty") ?? "0"));
    if (presentationQty.lte(0)) throw new Error("La cantidad debe ser mayor a cero.");

    const presentationUnit = parseUnit(formData.get("presentationUnit"));

    const totalPrice = new Decimal(String(formData.get("totalPrice") ?? "0"));
    if (totalPrice.lte(0)) throw new Error("El precio debe ser mayor a cero.");

    const comment = String(formData.get("comment") ?? "").trim() || null;

    const grossUnitCost = computeUnitCost(
      totalPrice,
      presentationQty,
      presentationUnit,
      product.baseUnit as UnitValue,
    );
    const computedUnitCost = applyYieldFactor(grossUnitCost, product.yieldPercentage);
    const presentationLabel = `${presentationQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[presentationUnit]}`;

    await prisma.purchase.create({
      data: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        folio,
        productId: product.id,
        purchaseDate: existing.purchaseDate,
        presentationLabel,
        presentationQty: presentationQty.toString(),
        presentationUnit,
        totalPrice: totalPrice.toString(),
        computedUnitCost: computedUnitCost.toString(),
        supplierId: existing.supplierId,
        createdByUserId: user.id,
        comment,
      },
    });

    await recalcProductCurrentCost(product.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar el producto." };
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${folio}`);
  revalidatePath("/products");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);
  redirect(`/purchases/${folio}${recipeId ? `?recipeId=${recipeId}` : ""}`);
}

export async function deletePurchase(
  purchaseId: string,
  recipeId?: string | null,
): Promise<DeletePurchaseResult | void> {
  const user = await requireSucursalContext();
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, sucursalId: user.sucursalId },
  });
  if (!purchase) throw new Error("Compra no encontrada.");

  const blocked = await findBlockingPayment(user.sucursalId, purchase.supplierId, purchase.folio);
  if (blocked) return blocked;

  await prisma.purchase.delete({ where: { id: purchase.id } });
  await recalcProductCurrentCost(purchase.productId);

  const remaining = await prisma.purchase.count({
    where: { sucursalId: user.sucursalId, folio: purchase.folio },
  });

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchase.folio}`);
  revalidatePath("/products");
  if (purchase.supplierId) revalidatePath(`/payments/${purchase.supplierId}`);
  revalidatePath("/payments");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);

  if (remaining > 0) {
    redirect(`/purchases/${purchase.folio}${recipeId ? `?recipeId=${recipeId}` : ""}`);
  }
  redirect(recipeId ? `/recipes/${recipeId}` : "/purchases");
}

/** Elimina TODOS los renglones de una compra (mismo folio), como si nunca se hubiera registrado. */
export async function deletePurchaseGroup(
  folio: number,
  recipeId?: string | null,
): Promise<DeletePurchaseResult | void> {
  const user = await requireSucursalContext();
  const purchases = await prisma.purchase.findMany({
    where: { sucursalId: user.sucursalId, folio },
  });
  if (purchases.length === 0) throw new Error("Compra no encontrada.");

  // Todos los renglones de un mismo folio comparten proveedor, asi que basta revisar uno.
  const supplierId = purchases[0].supplierId;
  const blocked = await findBlockingPayment(user.sucursalId, supplierId, folio);
  if (blocked) return blocked;

  const productIds = [...new Set(purchases.map((p) => p.productId))];

  await prisma.purchase.deleteMany({ where: { sucursalId: user.sucursalId, folio } });
  for (const productId of productIds) {
    await recalcProductCurrentCost(productId);
  }

  revalidatePath("/purchases");
  revalidatePath("/products");
  if (supplierId) revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);
  redirect(recipeId ? `/recipes/${recipeId}` : "/purchases");
}
