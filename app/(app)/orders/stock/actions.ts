"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

export async function saveStockTargets(formData: FormData) {
  const user = await requireOrgSession();

  const products = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    select: { id: true },
  });
  const productIds = new Set(products.map((p) => p.id));

  const updates: { id: string; targetStock: string }[] = [];
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("target:")) continue;
    const id = key.slice("target:".length);
    if (!productIds.has(id)) continue;
    const raw = String(rawValue).trim();
    let value: Decimal;
    try {
      value = new Decimal(raw || "0");
    } catch {
      continue;
    }
    if (value.lt(0)) continue;
    updates.push({ id, targetStock: value.toString() });
  }

  await prisma.$transaction(
    updates.map(({ id, targetStock }) =>
      prisma.product.update({ where: { id }, data: { targetStock } }),
    ),
  );

  revalidatePath("/orders/stock");
  revalidatePath("/orders/new");
}
