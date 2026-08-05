"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { applyYieldFactor, computeUnitCost, UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { recalcProductCurrentCost } from "@/lib/costing";

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

export async function deletePurchase(purchaseId: string): Promise<void> {
  const user = await requireSucursalContext();
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, sucursalId: user.sucursalId },
  });
  if (!purchase) throw new Error("Compra no encontrada.");

  await prisma.purchase.delete({ where: { id: purchase.id } });
  await recalcProductCurrentCost(purchase.productId);

  revalidatePath("/purchases");
  revalidatePath("/products");
  redirect("/purchases");
}
