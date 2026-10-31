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

  // Una compra ya abonada no se edita: cambiarle el importe dejaria el pago sin corresponder.
  const blockedByPayment = await findBlockingPayment(user.sucursalId, purchase.supplierId, purchase.folio);
  if (blockedByPayment) {
    return { error: blockedByPayment.error?.replace("antes de eliminarla", "antes de editarla") };
  }

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
/**
 * El borrado en si, sin decidir a donde se va la pantalla despues: el detalle de la compra
 * redirige (esa pantalla deja de existir) y la lista de facturas se queda donde esta.
 */
async function removePurchaseGroup(
  sucursalId: string,
  folio: number,
): Promise<{ blocked?: DeletePurchaseResult; supplierId: string | null }> {
  const purchases = await prisma.purchase.findMany({ where: { sucursalId, folio } });
  if (purchases.length === 0) throw new Error("Compra no encontrada.");

  // Todos los renglones de un mismo folio comparten proveedor, asi que basta revisar uno.
  const supplierId = purchases[0].supplierId;
  const blocked = await findBlockingPayment(sucursalId, supplierId, folio);
  if (blocked) return { blocked, supplierId };

  const productIds = [...new Set(purchases.map((p) => p.productId))];
  await prisma.purchase.deleteMany({ where: { sucursalId, folio } });
  for (const productId of productIds) {
    await recalcProductCurrentCost(productId);
  }
  return { supplierId };
}

/** Borra la compra completa desde la lista de facturas, sin salir de la lista. */
export async function deletePurchaseGroupFromList(
  folio: number,
): Promise<DeletePurchaseResult | void> {
  const user = await requireSucursalContext();
  const { blocked, supplierId } = await removePurchaseGroup(user.sucursalId, folio);
  if (blocked) return blocked;

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${folio}`);
  revalidatePath("/products");
  if (supplierId) revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
}

export async function deletePurchaseGroup(
  folio: number,
  recipeId?: string | null,
): Promise<DeletePurchaseResult | void> {
  const user = await requireSucursalContext();
  const { blocked, supplierId } = await removePurchaseGroup(user.sucursalId, folio);
  if (blocked) return blocked;

  revalidatePath("/purchases");
  revalidatePath("/products");
  if (supplierId) revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
  if (recipeId) revalidatePath(`/recipes/${recipeId}`);
  redirect(recipeId ? `/recipes/${recipeId}` : "/purchases");
}

/**
 * Edita los datos de la factura completa: proveedor, fecha y folio de factura.
 *
 * Estos tres datos son del documento, no de cada renglon: una compra con tres productos tiene
 * un solo proveedor y una sola fecha. Por eso se actualizan todos los renglones del folio a la
 * vez; editarlos por renglon dejaria la misma compra con dos proveedores distintos.
 *
 * Se bloquea si el folio ya tiene abonos registrados: cambiarle el proveedor a una compra ya
 * pagada movería el saldo de dos proveedores a la vez y dejaría el pago apuntando a quien no es.
 */
export async function updatePurchaseHeader(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();
  const folio = Number(formData.get("folio"));
  if (!Number.isInteger(folio)) return { error: "Folio invalido." };

  const purchases = await prisma.purchase.findMany({
    where: { sucursalId: user.sucursalId, folio },
    select: { id: true, supplierId: true },
  });
  if (purchases.length === 0) return { error: "Compra no encontrada." };

  const blocked = await findBlockingPayment(user.sucursalId, purchases[0].supplierId, folio);
  if (blocked) {
    return {
      error: blocked.error?.replace("antes de eliminarla", "antes de editarla"),
    };
  }

  try {
    const purchaseDateRaw = String(formData.get("purchaseDate") ?? "");
    if (!purchaseDateRaw) throw new Error("Indica la fecha de compra.");

    const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
    const supplierId = supplierIdRaw || null;
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!supplier) throw new Error("Proveedor no encontrado.");
    }

    const invoiceFolioRaw = String(formData.get("invoiceFolio") ?? "").trim().slice(0, 60);
    const invoiceFolio = invoiceFolioRaw || formatPurchaseFolio(folio);

    await prisma.purchase.updateMany({
      where: { sucursalId: user.sucursalId, folio },
      data: {
        purchaseDate: new Date(`${purchaseDateRaw}T00:00:00.000Z`),
        supplierId,
        invoiceFolio,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la compra." };
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${folio}`);
  revalidatePath("/payments");
  return {};
}
