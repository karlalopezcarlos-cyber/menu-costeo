"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

export async function createInventoryCount(formData: FormData) {
  const user = await requireSucursalContext();

  const dateRaw = String(formData.get("date") ?? "");
  if (!dateRaw) throw new Error("Indica la fecha del conteo.");

  const date = new Date(`${dateRaw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

  const existing = await prisma.inventoryCount.findFirst({
    where: { sucursalId: user.sucursalId, date },
  });
  if (existing) {
    // Ya existe un conteo para esta fecha: se abre ese en vez de crear uno duplicado.
    redirect(`/inventory/${existing.id}?existing=1`);
  }

  const count = await prisma.inventoryCount.create({
    data: {
      organizationId: user.organizationId,
      sucursalId: user.sucursalId,
      date,
      createdByUserId: user.id,
    },
  });

  redirect(`/inventory/${count.id}`);
}
