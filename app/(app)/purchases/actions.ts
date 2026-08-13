"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { applyYieldFactor, computeUnitCost, convertQty, UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { recalcProductCurrentCost } from "@/lib/costing";
import { formatOrderFolio } from "@/lib/orders/folio";

function parseUnit(value: unknown): UnitValue {
  if (typeof value === "string" && (UNITS as readonly string[]).includes(value)) {
    return value as UnitValue;
  }
  throw new Error("Unidad invalida.");
}

type PurchaseRowInput = {
  productId: string;
  presentationLabel: string;
  presentationQty: string;
  presentationUnit: string;
  totalPrice: string;
};

export async function createPurchase(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let purchaseOrderId: string | null = null;
  try {
    const user = await requireSucursalContext();

    const purchaseDateRaw = String(formData.get("purchaseDate") ?? "");
    const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
    const supplierId = supplierIdRaw || null;
    const rowsRaw = String(formData.get("rows") ?? "[]");
    purchaseOrderId = String(formData.get("purchaseOrderId") ?? "").trim() || null;

    if (!purchaseDateRaw) throw new Error("Indica la fecha de compra.");

    let rows: PurchaseRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de compra invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un producto.");
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId },
      });
      if (!supplier) throw new Error("Proveedor no encontrado.");
    }

    const purchaseOrder = purchaseOrderId
      ? await prisma.purchaseOrder.findFirst({
          where: { id: purchaseOrderId, sucursalId: user.sucursalId },
          include: { items: true },
        })
      : null;
    if (purchaseOrderId && !purchaseOrder) throw new Error("Pedido no encontrado.");

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const purchaseDate = new Date(purchaseDateRaw);

    // Cuando la compra referencia un pedido, sumamos aqui cuanto se recibio de cada producto (en
    // su unidad base) para acreditarlo al pedido despues de guardar la compra.
    const receivedByProduct = new Map<string, Decimal>();

    const toCreate = rows.map((row, index) => {
      const product = productById.get(row.productId);
      if (!product) throw new Error(`Selecciona un producto valido (fila ${index + 1}).`);

      const presentationQty = new Decimal(row.presentationQty || "0");
      if (presentationQty.lte(0)) {
        throw new Error(`La cantidad de "${product.name}" debe ser mayor a cero.`);
      }

      const presentationUnit = parseUnit(row.presentationUnit);

      // La presentacion ya no se escribe a mano: si el cliente no mando una (ej. captura libre sin
      // presentacion configurada), se genera un texto descriptivo a partir de la cantidad.
      const presentationLabel =
        row.presentationLabel.trim() ||
        `${presentationQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[presentationUnit]}`;

      const totalPrice = new Decimal(row.totalPrice || "0");
      if (totalPrice.lte(0)) {
        throw new Error(`El precio de "${product.name}" debe ser mayor a cero.`);
      }

      const grossUnitCost = computeUnitCost(
        totalPrice,
        presentationQty,
        presentationUnit,
        product.baseUnit as UnitValue,
      );
      const computedUnitCost = applyYieldFactor(grossUnitCost, product.yieldPercentage);

      if (purchaseOrder) {
        const baseQty = convertQty(presentationQty, presentationUnit, product.baseUnit as UnitValue);
        const prev = receivedByProduct.get(product.id) ?? new Decimal(0);
        receivedByProduct.set(product.id, prev.plus(baseQty));
      }

      return {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        productId: product.id,
        purchaseDate,
        presentationLabel,
        presentationQty: presentationQty.toString(),
        presentationUnit,
        totalPrice: totalPrice.toString(),
        computedUnitCost: computedUnitCost.toString(),
        supplierId,
        createdByUserId: user.id,
      };
    });

    // Si la compra viene de un pedido, siempre dejamos una nota con el folio de origen (para poder
    // rastrear el pedido desde Compras una vez que ya no aparece en el modulo de Pedidos), y le
    // agregamos el detalle de la diferencia cuando lo recibido no coincide con lo esperado.
    const noteByProduct = new Map<string, string>();
    if (purchaseOrder) {
      const folioLabel = formatOrderFolio(purchaseOrder.folio);
      const fmt = (d: Decimal, unit: UnitValue) =>
        `${d.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[unit]}`;
      for (const item of purchaseOrder.items) {
        const actual = receivedByProduct.get(item.productId);
        if (!actual) continue;
        const product = productById.get(item.productId);
        if (!product) continue;
        const baseUnit = product.baseUnit as UnitValue;
        const priorReceived = new Decimal(item.receivedQuantity ?? 0);
        const expected = Decimal.max(new Decimal(item.quantity).minus(priorReceived), 0);
        if (actual.equals(expected)) {
          noteByProduct.set(item.productId, `Pedido ${folioLabel}.`);
          continue;
        }
        const diff = actual.minus(expected);
        const note = diff.isNegative()
          ? `Pedido ${folioLabel}: se esperaban ${fmt(expected, baseUnit)}, llegaron ${fmt(actual, baseUnit)} (faltan ${fmt(diff.abs(), baseUnit)}).`
          : `Pedido ${folioLabel}: se esperaban ${fmt(expected, baseUnit)}, llegaron ${fmt(actual, baseUnit)} (sobran ${fmt(diff, baseUnit)}).`;
        noteByProduct.set(item.productId, note);
      }
    }
    const toCreateWithNotes = toCreate.map((entry) => ({
      ...entry,
      note: noteByProduct.get(entry.productId) ?? null,
    }));

    await prisma.$transaction(async (tx) => {
      // Todos los productos capturados en este envio del formulario comparten un solo folio,
      // sin importar cuantos renglones tenga la compra.
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextPurchaseFolio: { increment: 1 } },
        select: { nextPurchaseFolio: true },
      });
      const folio = org.nextPurchaseFolio - 1;
      const withFolios = toCreateWithNotes.map((entry) => ({ ...entry, folio }));
      await tx.purchase.createMany({ data: withFolios });
      if (!purchaseOrder) return;

      for (const item of purchaseOrder.items) {
        const delta = receivedByProduct.get(item.productId);
        if (!delta) continue;
        const prevReceived = new Decimal(item.receivedQuantity ?? 0);
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: prevReceived.plus(delta).toString() },
        });
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: purchaseOrder.id },
      });
      const allComplete = refreshedItems.every((item) =>
        new Decimal(item.receivedQuantity ?? 0).gte(new Decimal(item.quantity)),
      );
      if (allComplete) {
        await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: { status: "RECEIVED", receivedAt: new Date() },
        });
      }
    });

    for (const productId of productIds) {
      await recalcProductCurrentCost(productId);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la compra." };
  }

  revalidatePath("/purchases");
  revalidatePath("/products");
  revalidatePath("/orders");
  revalidatePath("/orders/new");
  if (purchaseOrderId) revalidatePath(`/orders/${purchaseOrderId}`);
  redirect("/purchases");
}
