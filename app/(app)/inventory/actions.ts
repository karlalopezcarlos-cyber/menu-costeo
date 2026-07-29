"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

export async function createInventoryCount(formData: FormData) {
  const user = await requireOrgSession();

  const dateRaw = String(formData.get("date") ?? "");
  if (!dateRaw) throw new Error("Indica la fecha del conteo.");

  const date = new Date(`${dateRaw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

  const count = await prisma.inventoryCount.create({
    data: {
      organizationId: user.organizationId,
      date,
      createdByUserId: user.id,
    },
  });

  redirect(`/inventory/${count.id}`);
}
