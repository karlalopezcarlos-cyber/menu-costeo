"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { convertQty, removeYieldFactor, type UnitValue } from "@/lib/units";

export type CleaningState = { error?: string };

/**
 * Registra una limpieza: entra un producto a granel y sale otro producto ya habilitado.
 *
 * De 1 kg de camaron crudo salen 800 g de camaron limpio. La diferencia es merma real del
 * proceso, y es lo que hace que el kilo limpio cueste mas que el kilo crudo. Ese costo se
 * guarda en el producto destino, de donde lo toman todas las recetas que lo usan.
 *
 * Tres decisiones importantes:
 * - Lo que entra se valua al costo BRUTO del origen (sin su rendimiento), porque la merma de
 *   este proceso ya se esta midiendo aqui: aplicar las dos cosas la contaria dos veces.
 * - El costo del destino es el costo total de lo que entro entre lo que salio. Nada se pierde
 *   ni se inventa: el dinero que entro es el que sale repartido en menos producto.
 * - El rendimiento del producto ORIGEN no se toca. Su merma vive en este paso, no en su ficha.
 */
export async function createCleaning(
  _prevState: CleaningState | undefined,
  formData: FormData,
): Promise<CleaningState> {
  try {
    const user = await requireSucursalContext();

    const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
    const outputProductId = String(formData.get("outputProductId") ?? "").trim();
    const dateRaw = String(formData.get("date") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;

    if (!sourceProductId) return { error: "Elige el producto que limpiaste." };
    if (!outputProductId) return { error: "Elige el producto que obtuviste." };
    if (sourceProductId === outputProductId) {
      return { error: "El producto que sale debe ser distinto al que entro." };
    }
    if (!dateRaw) return { error: "Captura la fecha." };

    const initialQty = new Decimal(String(formData.get("initialQty") ?? "0"));
    const outputQtyRaw = new Decimal(String(formData.get("outputQty") ?? "0"));
    if (initialQty.lte(0)) return { error: "El peso inicial debe ser mayor a cero." };
    if (outputQtyRaw.lte(0)) return { error: "Lo que obtuviste debe ser mayor a cero." };

    const [source, output] = await Promise.all([
      prisma.product.findFirst({
        where: { id: sourceProductId, organizationId: user.organizationId },
        select: { id: true, name: true, baseUnit: true, currentUnitCost: true, yieldPercentage: true },
      }),
      prisma.product.findFirst({
        where: { id: outputProductId, organizationId: user.organizationId },
        select: { id: true, name: true, baseUnit: true, isProcessed: true },
      }),
    ]);
    if (!source || !output) return { error: "Alguno de los productos no existe en tu organizacion." };

    // Entrada y salida se comparan en la unidad del origen: si el limpio se mide en gramos y el
    // crudo en kilos, el rendimiento se calcula igual de bien.
    let outputInSourceUnit: Decimal;
    try {
      outputInSourceUnit = convertQty(
        outputQtyRaw,
        output.baseUnit as UnitValue,
        source.baseUnit as UnitValue,
      );
    } catch {
      return {
        error: `${source.name} se mide en una unidad que no se puede comparar con la de ${output.name}. Usa unidades del mismo tipo (peso con peso, volumen con volumen).`,
      };
    }

    if (outputInSourceUnit.gt(initialQty)) {
      return {
        error: `Obtuviste mas producto del que entro (${outputInSourceUnit.toFixed(3)} contra ${initialQty.toFixed(3)}). Revisa las cantidades.`,
      };
    }

    const realYieldPct = outputInSourceUnit.dividedBy(initialQty).times(100);

    // Costo bruto del origen: su costo de catalogo sin el factor de rendimiento.
    const grossUnitCost = removeYieldFactor(
      source.currentUnitCost.toString(),
      source.yieldPercentage.toString(),
    );
    const totalCost = initialQty.times(grossUnitCost);
    const outputUnitCost = totalCost.dividedBy(outputQtyRaw);

    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextPortioningFolio: { increment: 1 } },
        select: { nextPortioningFolio: true },
      });

      await tx.portioningEntry.create({
        data: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          folio: org.nextPortioningFolio - 1,
          type: "CLEANING",
          date: new Date(`${dateRaw}T00:00:00.000Z`),
          productId: source.id,
          initialQty: initialQty.toString(),
          unitCost: grossUnitCost.toString(),
          realYieldPct: realYieldPct.toFixed(2),
          outputProductId: output.id,
          outputQty: outputQtyRaw.toString(),
          comment,
          createdByUserId: user.id,
        },
      });

      // El costo del producto limpio queda al dia con esta limpieza. Al ser un producto de
      // proceso, nada mas lo va a recalcular: no tiene compras de donde sacarlo.
      await tx.product.update({
        where: { id: output.id },
        data: {
          currentUnitCost: outputUnitCost.toDecimalPlaces(6).toString(),
          currentUnitCostUpdatedAt: new Date(`${dateRaw}T00:00:00.000Z`),
          isProcessed: true,
        },
      });
    });
  } catch (error) {
    console.error("createCleaning error:", error);
    return {
      error: `No se pudo guardar la limpieza: ${error instanceof Error ? error.message.slice(0, 200) : "error desconocido"}`,
    };
  }

  revalidatePath("/portioning");
  revalidatePath("/products");
  revalidatePath("/recipes");
  redirect("/portioning");
}
