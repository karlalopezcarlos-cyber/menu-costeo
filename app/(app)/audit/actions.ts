"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

export async function saveAuditComments(finalCountId: string, formData: FormData) {
  const user = await requireOrgSession();

  const count = await prisma.inventoryCount.findFirst({
    where: { id: finalCountId, organizationId: user.organizationId },
  });
  if (!count) throw new Error("Conteo no encontrado.");

  const toUpsert: { type: "product" | "subrecipe"; id: string; comment: string }[] = [];
  const toDelete: { type: "product" | "subrecipe"; id: string }[] = [];

  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("comment:")) continue;
    const [, type, id] = key.split(":");
    if (type !== "product" && type !== "subrecipe") continue;
    const comment = String(rawValue).trim();
    if (comment) toUpsert.push({ type, id, comment });
    else toDelete.push({ type, id });
  }

  await prisma.$transaction([
    ...toUpsert.map(({ type, id, comment }) =>
      type === "product"
        ? prisma.auditComment.upsert({
            where: { finalCountId_productId: { finalCountId: count.id, productId: id } },
            create: {
              organizationId: user.organizationId,
              finalCountId: count.id,
              productId: id,
              comment,
              createdByUserId: user.id,
            },
            update: { comment, createdByUserId: user.id },
          })
        : prisma.auditComment.upsert({
            where: { finalCountId_subRecipeId: { finalCountId: count.id, subRecipeId: id } },
            create: {
              organizationId: user.organizationId,
              finalCountId: count.id,
              subRecipeId: id,
              comment,
              createdByUserId: user.id,
            },
            update: { comment, createdByUserId: user.id },
          }),
    ),
    ...toDelete.map(({ type, id }) =>
      type === "product"
        ? prisma.auditComment.deleteMany({ where: { finalCountId: count.id, productId: id } })
        : prisma.auditComment.deleteMany({ where: { finalCountId: count.id, subRecipeId: id } }),
    ),
  ]);

  revalidatePath("/audit");
}
