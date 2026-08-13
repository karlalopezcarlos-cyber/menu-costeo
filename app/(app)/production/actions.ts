"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";

type ProductionRowInput = {
  subRecipeId: string;
  quantity: string;
  comment: string;
};

export async function createProductionEntries(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();

    const productionDateRaw = String(formData.get("productionDate") ?? "");
    const rowsRaw = String(formData.get("rows") ?? "[]");

    if (!productionDateRaw) throw new Error("Indica la fecha de la produccion.");

    let rows: ProductionRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de produccion invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos una subreceta.");
    }

    const subRecipeIds = [...new Set(rows.map((r) => r.subRecipeId))];
    const subRecipes = await prisma.recipe.findMany({
      where: { id: { in: subRecipeIds }, sucursalId: user.sucursalId, isMenuItem: false },
    });
    const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));

    const graph = await loadOrgRecipeGraph(user.sucursalId);
    const costMemo = new Map<string, Decimal>();

    const productionDate = new Date(productionDateRaw);

    const toCreate = rows.map((row, index) => {
      const subRecipe = subRecipeById.get(row.subRecipeId);
      if (!subRecipe) throw new Error(`Selecciona una subreceta valida (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad producida de "${subRecipe.name}" debe ser mayor a cero.`);
      }

      const node = graph.recipes.get(subRecipe.id);
      let unitCost = new Decimal(0);
      if (node && !node.yieldQty.isZero()) {
        try {
          unitCost = getRecipeCost(subRecipe.id, graph, costMemo).dividedBy(node.yieldQty);
        } catch {
          unitCost = new Decimal(0);
        }
      }

      return {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        subRecipeId: subRecipe.id,
        date: productionDate,
        quantity: quantity.toString(),
        unit: subRecipe.yieldUnit,
        unitCost: unitCost.toString(),
        comment: row.comment.trim() || null,
        createdByUserId: user.id,
      };
    });

    await prisma.$transaction(async (tx) => {
      // Todas las subrecetas capturadas en este envio del formulario comparten un solo folio, sin
      // importar cuantos renglones tenga, igual que Compras/Pedidos/Requisiciones.
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextProductionFolio: { increment: 1 } },
        select: { nextProductionFolio: true },
      });
      const folio = org.nextProductionFolio - 1;
      await tx.productionEntry.createMany({ data: toCreate.map((entry) => ({ ...entry, folio })) });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la produccion." };
  }

  revalidatePath("/production");
  revalidatePath("/audit");
  redirect("/production");
}

export async function deleteProductionEntry(id: string): Promise<void> {
  const user = await requireSucursalContext();

  const entry = await prisma.productionEntry.findFirst({ where: { id, sucursalId: user.sucursalId } });
  if (!entry) throw new Error("Produccion no encontrada.");

  await prisma.productionEntry.delete({ where: { id: entry.id } });

  revalidatePath("/production");
  revalidatePath("/audit");
}
