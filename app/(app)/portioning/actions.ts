"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { type UnitValue } from "@/lib/units";
import { computePortioning, averageYield, PortioningError } from "@/lib/portioning";

export type PortioningState = { error?: string };

/** Cuantos porcionamientos recientes entran al promedio que actualiza el rendimiento del producto. */
const EVENTOS_PARA_PROMEDIO = 10;

export async function createPortioning(
  _prevState: PortioningState | undefined,
  formData: FormData,
): Promise<PortioningState> {
  let folio: number | null = null;

  try {
    const user = await requireSucursalContext();

    const productId = String(formData.get("productId") ?? "").trim();
    const dateRaw = String(formData.get("date") ?? "").trim();
    const initialQtyRaw = String(formData.get("initialQty") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;

    if (!productId) return { error: "Elige el producto que porcionaste." };
    if (!dateRaw) return { error: "Captura la fecha del porcionamiento." };

    const initialQty = new Decimal(initialQtyRaw || "0");
    if (initialQty.lte(0)) return { error: "El peso inicial debe ser mayor a cero." };

    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
      select: { id: true, name: true, baseUnit: true, currentUnitCost: true },
    });
    if (!product) return { error: "El producto no existe o no es de tu organizacion." };

    // Renglones de salida: receta de porcion + cuantas salieron.
    const recipeIds = formData.getAll("outputRecipeId").map((v) => String(v).trim());
    const portionCounts = formData.getAll("outputPortions").map((v) => String(v).trim());

    const recetasPedidas = recipeIds
      .map((recipeId, i) => ({ recipeId, portionsRaw: portionCounts[i] ?? "" }))
      .filter((r) => r.recipeId && r.portionsRaw);

    if (recetasPedidas.length === 0) {
      return { error: "Captura al menos un tipo de porcion que haya salido." };
    }

    const recetas = await prisma.recipe.findMany({
      where: {
        id: { in: recetasPedidas.map((r) => r.recipeId) },
        sucursalId: user.sucursalId,
        isPortion: true,
      },
      select: { id: true, name: true, yieldQty: true, yieldUnit: true },
    });
    const recetaPorId = new Map(recetas.map((r) => [r.id, r]));

    const outputs = recetasPedidas.map((pedida) => {
      const receta = recetaPorId.get(pedida.recipeId);
      if (!receta) {
        throw new PortioningError("Una de las recetas de porcion no existe o no esta marcada como porcion.");
      }
      return {
        recipeId: receta.id,
        recipeName: receta.name,
        portions: Number(pedida.portionsRaw),
        portionQty: receta.yieldQty.toString(),
        portionUnit: receta.yieldUnit as UnitValue,
      };
    });

    const calculo = computePortioning(
      initialQty,
      product.baseUnit as UnitValue,
      product.currentUnitCost.toString(),
      outputs,
    );

    // El rendimiento que se le guarda al producto es el promedio de sus ultimos porcionamientos,
    // incluyendo este: un corte atipico no debe mover el costeo de todas sus recetas.
    const previos = await prisma.portioningEntry.findMany({
      where: { organizationId: user.organizationId, productId: product.id },
      orderBy: { date: "desc" },
      take: EVENTOS_PARA_PROMEDIO - 1,
      select: { realYieldPct: true },
    });
    const nuevoRendimiento = averageYield([
      calculo.realYieldPct,
      ...previos.map((p) => p.realYieldPct.toString()),
    ]);

    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextPortioningFolio: { increment: 1 } },
        select: { nextPortioningFolio: true },
      });
      folio = org.nextPortioningFolio - 1;

      await tx.portioningEntry.create({
        data: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          folio,
          date: new Date(`${dateRaw}T00:00:00.000Z`),
          productId: product.id,
          initialQty: calculo.initialQty.toString(),
          unitCost: product.currentUnitCost.toString(),
          realYieldPct: calculo.realYieldPct.toFixed(2),
          comment,
          createdByUserId: user.id,
          outputs: {
            create: calculo.outputs.map((o, index) => ({
              recipeId: o.recipeId,
              portions: o.portions,
              portionQty: o.portionQtyInBase.toString(),
              realUnitCost: o.realUnitCost.toFixed(6),
              sortOrder: index,
            })),
          },
        },
      });

      if (nuevoRendimiento) {
        await tx.product.update({
          where: { id: product.id },
          data: { yieldPercentage: nuevoRendimiento.toFixed(2) },
        });
      }
    });
  } catch (error) {
    if (error instanceof PortioningError) return { error: error.message };
    console.error("createPortioning error:", error);
    return {
      error: `No se pudo guardar el porcionamiento: ${error instanceof Error ? error.message.slice(0, 200) : "error desconocido"}`,
    };
  }

  revalidatePath("/portioning");
  revalidatePath("/products");
  redirect("/portioning");
}
