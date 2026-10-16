"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

type OrderRowInput = {
  productId: string;
  quantity: string;
  presentationLabel: string;
};

type SupplierOrderRowInput = OrderRowInput & {
  /** Proveedor con el que se va a pedir esta linea. Vacio = pedido sin proveedor asignado. */
  supplierId: string;
};

/**
 * Crea un pedido por proveedor a partir de una sola captura.
 *
 * Un pedido se le manda a un proveedor, no al aire: si el faltante del dia trae camaron de la
 * pescaderia y aceite del abarrotero, mandar un solo pedido obliga a recortarlo a mano. Aqui se
 * captura todo junto una vez y se parte en tantos pedidos como proveedores haya, cada uno con su
 * folio, para poder mandarlo con los datos de ese proveedor.
 *
 * Las lineas sin proveedor no se rechazan: se juntan en un pedido aparte, para no frenar la
 * compra del dia por un producto al que todavia no le han asignado con quien se pide.
 */
export async function createPurchaseOrdersBySupplier(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let nuevosIds: string[];
  try {
    const user = await requireSucursalContext();

    const comment = String(formData.get("comment") ?? "").trim() || null;

    let rows: SupplierOrderRowInput[];
    try {
      rows = JSON.parse(String(formData.get("rows") ?? "[]"));
    } catch {
      throw new Error("Datos de pedido invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Selecciona al menos un producto para el pedido.");
    }

    const supplierIds = [...new Set(rows.map((r) => (r.supplierId ?? "").trim()).filter(Boolean))];
    if (supplierIds.length > 0) {
      const encontrados = await prisma.supplier.findMany({
        where: { id: { in: supplierIds }, organizationId: user.organizationId },
        select: { id: true },
      });
      if (encontrados.length !== supplierIds.length) throw new Error("Proveedor no encontrado.");
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    // Un grupo por proveedor, respetando el orden en que aparecen las lineas.
    const grupos = new Map<string, { productId: string; quantity: string; presentationLabel: string }[]>();
    rows.forEach((row, index) => {
      const product = productById.get(row.productId);
      if (!product) throw new Error(`Producto invalido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad a pedir de "${product.name}" debe ser mayor a cero.`);
      }

      const clave = (row.supplierId ?? "").trim();
      const items = grupos.get(clave) ?? [];
      items.push({
        productId: product.id,
        quantity: quantity.toString(),
        presentationLabel: row.presentationLabel.trim() || product.name,
      });
      grupos.set(clave, items);
    });

    const creados = await prisma.$transaction(async (tx) => {
      // Un solo incremento para todos los folios: quedan consecutivos y nadie mas se los gana
      // entre pedido y pedido.
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextOrderFolio: { increment: grupos.size } },
        select: { nextOrderFolio: true },
      });
      const primerFolio = org.nextOrderFolio - grupos.size;

      const ids: string[] = [];
      let i = 0;
      for (const [supplierId, items] of grupos) {
        const order = await tx.purchaseOrder.create({
          data: {
            organizationId: user.organizationId,
            sucursalId: user.sucursalId,
            folio: primerFolio + i,
            createdByUserId: user.id,
            supplierId: supplierId || null,
            comment,
            items: { create: items },
          },
          select: { id: true },
        });
        ids.push(order.id);
        i += 1;
      }
      return ids;
    });
    nuevosIds = creados;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudieron crear los pedidos." };
  }

  revalidatePath("/orders");
  revalidatePath("/orders/new");
  redirect(`/orders?nuevos=${nuevosIds.join(",")}`);
}

export async function createPurchaseOrder(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let orderId: string;
  // Cuando el pedido se crea desde Proyeccion con la intencion de comprar de inmediato (en vez de
  // solo dejarlo abierto para despues), se manda directo a Registrar compra con este pedido ya
  // precargado, en vez de aterrizar en el detalle del pedido.
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  try {
    const user = await requireSucursalContext();

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
          sucursalId: user.sucursalId,
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
  if (redirectTo === "purchase") {
    redirect(`/purchases/new?pedido=${orderId}`);
  }
  redirect(`/orders/${orderId}`);
}
