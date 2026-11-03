"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

/**
 * La tasa de IVA con la que se desbrutean las ventas. Afecta todo el historico y a proposito:
 * no es un dato que cambie con cada venta, es como se lee el precio de carta. Si manana el
 * negocio vende algo en tasa 0, esto se baja a la categoria de receta.
 */
export async function setSalesIvaRate(_organizationId: string, value: string) {
  const user = await requireOrgSession();

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("La tasa de IVA debe ir de 0% a 100%.");
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { salesIvaRate: rate.toString() },
  });

  revalidatePath("/settings/taxes");
  revalidatePath("/dashboard");
}
