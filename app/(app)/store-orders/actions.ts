"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

export async function confirmStoreOrder(orderId: string): Promise<void> {
  const user = await requireSucursalContext();

  await prisma.storeOrder.updateMany({
    where: { id: orderId, sucursalId: user.sucursalId, confirmedAt: null },
    data: { confirmedAt: new Date() },
  });

  revalidatePath("/store-orders");
}

export async function markStoreOrderFulfilled(orderId: string): Promise<void> {
  const user = await requireSucursalContext();

  await prisma.storeOrder.updateMany({
    where: { id: orderId, sucursalId: user.sucursalId },
    data: { status: "fulfilled" },
  });

  revalidatePath("/store-orders");
}

export async function cancelStoreOrder(orderId: string): Promise<void> {
  const user = await requireSucursalContext();

  await prisma.storeOrder.updateMany({
    where: { id: orderId, sucursalId: user.sucursalId },
    data: { status: "cancelled" },
  });

  revalidatePath("/store-orders");
}

export async function deleteStoreOrder(orderId: string): Promise<void> {
  const user = await requireSucursalContext();

  const order = await prisma.storeOrder.findFirst({ where: { id: orderId, sucursalId: user.sucursalId } });
  if (!order) throw new Error("Pedido no encontrado.");

  // Los renglones (StoreOrderItem) quedan borrados en cascada por el schema.
  await prisma.storeOrder.delete({ where: { id: order.id } });

  revalidatePath("/store-orders");
  revalidatePath("/planning/plu");
}
