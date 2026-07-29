"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { buildOrderPdf, type OrderPdfItem } from "@/lib/pdf/export-order";
import { formatOrderItemQuantityLabel } from "@/lib/orders/quantity-label";
import { formatOrderFolio } from "@/lib/orders/folio";
import { sendOrderEmail as sendOrderEmailViaResend } from "@/lib/email/send-order-email";

async function getOrder(orderId: string, organizationId: string) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, organizationId },
    include: { items: true },
  });
  if (!order) throw new Error("Pedido no encontrado.");
  return order;
}

export async function updatePurchaseOrderItems(orderId: string, formData: FormData) {
  const user = await requireOrgSession();
  const order = await getOrder(orderId, user.organizationId);
  const itemById = new Map(order.items.map((i) => [i.id, i]));

  const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
  const supplierId = supplierIdRaw || null;
  const comment = String(formData.get("comment") ?? "").trim() || null;

  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: user.organizationId },
    });
    if (!supplier) throw new Error("Proveedor no encontrado.");
  }

  const toDeleteIds: string[] = [];
  const updates: { id: string; presentationLabel: string; quantity: string; itemComment: string | null }[] = [];

  for (const item of order.items) {
    const rawQty = String(formData.get(`qty:${item.id}`) ?? "").trim();
    const presentationLabel = String(formData.get(`presentation:${item.id}`) ?? "").trim();
    const itemComment = String(formData.get(`itemComment:${item.id}`) ?? "").trim() || null;

    let quantity: Decimal;
    try {
      quantity = new Decimal(rawQty || "0");
    } catch {
      continue;
    }

    if (quantity.lte(0)) {
      toDeleteIds.push(item.id);
      continue;
    }

    updates.push({
      id: item.id,
      presentationLabel: presentationLabel || itemById.get(item.id)!.presentationLabel,
      quantity: quantity.toString(),
      itemComment,
    });
  }

  await prisma.$transaction([
    prisma.purchaseOrder.update({ where: { id: orderId }, data: { supplierId, comment } }),
    ...updates.map(({ id, presentationLabel, quantity, itemComment }) =>
      prisma.purchaseOrderItem.update({
        where: { id },
        data: { presentationLabel, quantity, comment: itemComment },
      }),
    ),
    ...(toDeleteIds.length
      ? [prisma.purchaseOrderItem.deleteMany({ where: { id: { in: toDeleteIds } } })]
      : []),
  ]);

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

export async function addPurchaseOrderItem(
  orderId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireOrgSession();
    const order = await getOrder(orderId, user.organizationId);

    const productId = String(formData.get("productId") ?? "").trim();
    if (!productId) throw new Error("Selecciona un producto.");

    if (order.items.some((item) => item.productId === productId)) {
      throw new Error("Este producto ya esta en el pedido.");
    }

    const rawQty = String(formData.get("quantity") ?? "").trim();
    const quantity = new Decimal(rawQty || "0");
    if (quantity.lte(0)) throw new Error("La cantidad debe ser mayor a cero.");

    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
    });
    if (!product) throw new Error("Producto no encontrado.");

    const presentationLabel = String(formData.get("presentationLabel") ?? "").trim() || product.name;

    await prisma.purchaseOrderItem.create({
      data: { purchaseOrderId: orderId, productId, quantity: quantity.toString(), presentationLabel },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar el producto." };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders/new");
  return { success: true };
}

export async function reopenPurchaseOrder(orderId: string) {
  const user = await requireOrgSession();
  await getOrder(orderId, user.organizationId);

  await prisma.purchaseOrder.update({
    where: { id: orderId },
    data: { status: "OPEN", receivedAt: null },
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/orders/new");
}

export async function sendOrderEmail(
  orderId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireOrgSession();

    const [order, organization] = await Promise.all([
      prisma.purchaseOrder.findFirst({
        where: { id: orderId, organizationId: user.organizationId },
        include: {
          items: { include: { product: { include: { presentations: true } } }, orderBy: { createdAt: "asc" } },
          supplier: true,
        },
      }),
      prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
    ]);
    if (!order) throw new Error("Pedido no encontrado.");
    if (!order.supplier?.email) throw new Error("Este proveedor no tiene correo configurado.");

    const items: OrderPdfItem[] = order.items.map((item) => ({
      productName: item.product.name,
      presentationLabel: item.presentationLabel,
      quantityLabel: formatOrderItemQuantityLabel(item.quantity, item.presentationLabel, item.product),
      comment: item.comment,
    }));

    const dateLabel = order.createdAt.toLocaleDateString("es-MX", { timeZone: "UTC" });
    const pdfBuffer = await buildOrderPdf({
      folioLabel: formatOrderFolio(order.folio),
      dateLabel,
      supplierName: order.supplier?.name ?? null,
      comment: order.comment,
      items,
    });

    await sendOrderEmailViaResend({
      to: order.supplier.email,
      supplierName: order.supplier.name,
      dateLabel,
      organizationName: organization?.name ?? "Restaurante",
      pdfBuffer,
    });

    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo enviar el correo." };
  }
}

export async function deletePurchaseOrder(orderId: string) {
  const user = await requireOrgSession();
  await getOrder(orderId, user.organizationId);

  await prisma.purchaseOrder.delete({ where: { id: orderId } });

  revalidatePath("/orders");
  revalidatePath("/orders/new");
  redirect("/orders");
}
