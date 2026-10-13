"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { computePortioning, averageYield, PortioningError } from "@/lib/portioning";
import { loadPortioningOptions } from "@/lib/portioning-options";

export type PortioningState = { error?: string };

/** Cuantos porcionamientos recientes entran al promedio que actualiza el rendimiento del producto. */
const EVENTOS_PARA_PROMEDIO = 10;

export async function createPortioning(
  _prevState: PortioningState | undefined,
  formData: FormData,
): Promise<PortioningState> {
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
      select: { id: true, name: true, baseUnit: true, currentUnitCost: true, yieldPercentage: true },
    });
    if (!product) return { error: "El producto no existe o no es de tu organizacion." };

    // El consumo por porcion y el costo de los demas ingredientes se recalculan aqui desde las
    // recetas, nunca se toman de lo que mande el navegador.
    const { options } = await loadPortioningOptions(user.sucursalId, [product]);

    const recipeIds = formData.getAll("outputRecipeId").map((v) => String(v).trim());
    const portionCounts = formData.getAll("outputPortions").map((v) => String(v).trim());

    const pedidas = recipeIds
      .map((recipeId, i) => ({ recipeId, portionsRaw: portionCounts[i] ?? "" }))
      .filter((r) => r.recipeId && r.portionsRaw);

    if (pedidas.length === 0) {
      return { error: "Captura al menos un tipo de porcion que haya salido." };
    }

    const outputs = pedidas.map((pedida) => {
      const option = options.find((o) => o.recipeId === pedida.recipeId && o.productId === product.id);
      if (!option) {
        throw new PortioningError(
          `Una de las recetas no lleva ${product.name} entre sus ingredientes, o no esta marcada como porcion.`,
        );
      }
      return {
        recipeId: option.recipeId,
        recipeName: option.recipeName,
        portions: Number(pedida.portionsRaw),
        baseQtyPerPortion: option.baseQtyPerPortion,
        extraCostPerPortion: option.extraCostPerPortion,
      };
    });

    const calculo = computePortioning(initialQty, product.currentUnitCost.toString(), outputs);

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
      const folio = org.nextPortioningFolio - 1;

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
              portionQty: o.baseQtyPerPortion.toString(),
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
