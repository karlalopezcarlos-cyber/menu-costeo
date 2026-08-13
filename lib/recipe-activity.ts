import { prisma } from "@/lib/prisma";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";

type RecipeActivityType = "CREATED" | "ITEM_ADDED" | "ITEM_REMOVED" | "ARCHIVED" | "UNARCHIVED" | "UPDATED";

export async function logRecipeActivity(params: {
  organizationId: string;
  sucursalId: string;
  recipeId: string;
  type: RecipeActivityType;
  message: string;
  createdByUserId?: string;
}) {
  await prisma.recipeActivity.create({
    data: {
      organizationId: params.organizationId,
      sucursalId: params.sucursalId,
      recipeId: params.recipeId,
      type: params.type,
      message: params.message,
      createdByUserId: params.createdByUserId ?? null,
    },
  });
}

export function describeQuantity(quantity: unknown, unit: UnitValue): string {
  return `${quantity?.toString()} ${UNIT_LABELS[unit]}`;
}

export type TimelineEntry = {
  id: string;
  date: Date;
  type: RecipeActivityType;
  message: string;
  userName: string | null;
};

/**
 * Linea de tiempo de una receta: solo sus propios movimientos (creacion, ingredientes
 * agregados/quitados, actualizaciones, archivado). Las compras que afectan el costo de sus
 * ingredientes se consultan por separado desde cada renglon de ingrediente.
 */
export async function getRecipeTimeline(organizationId: string, recipeId: string): Promise<TimelineEntry[]> {
  const activities = await prisma.recipeActivity.findMany({
    where: { organizationId, recipeId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return activities.map((a) => ({
    id: a.id,
    date: a.createdAt,
    type: a.type,
    message: a.message,
    userName: a.createdBy?.name ?? a.createdBy?.email ?? null,
  }));
}
