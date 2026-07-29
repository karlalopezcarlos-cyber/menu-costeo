"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

type OrderRowInput = {
  productId: string;
  quantity: string;
  presentationLabel: string;
};

export async function createPurchaseOrder(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let orderId: string;
  try {
    const user = await requireOrgSession();

    const rowsRaw = String(formData.get("rows") ?? "[]");
    const supplierIdRaw = String(formData.get("supplierId") ?? "").trim();
    const supplierId = supplierIdRaw || null;
    const comment = String(formData.get("comment") ?? "").trim() || null;

    let rows: OrderRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de pedido invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Selecciona al menos un producto para el pedido.");
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId },
      });
      if (!supplier) throw new Error("Proveedor no encontrado.");
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const items = rows.map((row, index) => {
      const product = productById.get(row.productId);
      if (!product) throw new Error(`Producto invalido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad a pedir de "${product.name}" debe ser mayor a cero.`);
      }

      const presentationLabel = row.presentationLabel.trim() || product.name;

      return {
        productId: product.id,
        quantity: quantity.toString(),
        presentationLabel,
      };
    });

    const order = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextOrderFolio: { increment: 1 } },
        select: { nextOrderFolio: true },
      });
      const folio = org.nextOrderFolio - 1;
      return tx.purchaseOrder.create({
        data: {
          organizationId: user.organizationId,
          folio,
          createdByUserId: user.id,
          supplierId,
          comment,
          items: { create: items },
        },
      });
    });
    orderId = order.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el pedido." };
  }

  revalidatePath("/orders");
  revalidatePath("/orders/new");
  redirect(`/orders/${orderId}`);
}
