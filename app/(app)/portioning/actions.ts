"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import {
  computeTransformation,
  resolveRefQtyPerUnit,
  TransformationError,
  type TransformationOutputInput,
} from "@/lib/transformations";
import { loadTransformationProducts } from "@/lib/transformation-options";
import { recalcProductCostsForYield } from "@/lib/costing";
import type { UnitValue } from "@/lib/units";

export type TransformationState = { error?: string };

/**
 * Registra una transformacion: entra un producto, salen otros.
 *
 * Es el mismo movimiento para limpiar y para porcionar. Cada transformacion vale por si sola:
 * se puede porcionar el crudo directo o el ya limpio, segun lo que se haya hecho ese dia, y
 * nada obliga a que una cosa venga despues de la otra.
 *
 * Dos decisiones que son el corazon de esto:
 * - **No hay tope.** Si salieron mas porciones de las que "deberian", se guarda igual: el
 *   producto pudo venir de dos cajas o la bascula pudo estar mal. El costo se reparte entre lo
 *   que de verdad salio, que es lo unico que se sabe con certeza.
 * - **No se toca el producto que entro.** Un mal corte ya no le reescribe el rendimiento al
 *   camaron ni recostea sus compras pasadas. El rendimiento real queda guardado en el evento, y
 *   llevarlo al catalogo es una decision aparte (aplicarRendimientoAlCatalogo).
 */
export async function createTransformation(
  _prevState: TransformationState | undefined,
  formData: FormData,
): Promise<TransformationState> {
  try {
    const user = await requireSucursalContext();

    const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
    const dateRaw = String(formData.get("date") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;

    if (!sourceProductId) return { error: "Elige el producto que entro." };
    if (!dateRaw) return { error: "Captura la fecha." };

    const initialQty = new Decimal(String(formData.get("initialQty") ?? "0") || "0");
    if (initialQty.lte(0)) return { error: "Lo que entro debe ser mayor a cero." };

    const catalogo = await loadTransformationProducts(user.organizationId, user.sucursalId);
    const porId = new Map(catalogo.map((p) => [p.id, p]));

    const source = porId.get(sourceProductId);
    if (!source) return { error: "El producto que entro no existe o esta archivado." };

    const outputIds = formData.getAll("outputProductId").map((v) => String(v).trim());
    const outputQtys = formData.getAll("outputQty").map((v) => String(v).trim());
    const outputRefs = formData.getAll("outputRefQty").map((v) => String(v).trim());

    const capturadas = outputIds
      .map((productId, i) => ({ productId, qty: outputQtys[i] ?? "", ref: outputRefs[i] ?? "" }))
      .filter((o) => o.productId && o.qty);

    if (capturadas.length === 0) {
      return { error: "Captura al menos un producto que haya salido, con su cantidad." };
    }

    const vistos = new Set<string>();
    const outputs: TransformationOutputInput[] = [];
    for (const fila of capturadas) {
      const output = porId.get(fila.productId);
      if (!output) return { error: "Uno de los productos que salieron no existe o esta archivado." };
      if (output.id === source.id) {
        return { error: `${output.name} no puede entrar y salir en la misma transformacion.` };
      }
      if (vistos.has(output.id)) {
        return { error: `${output.name} esta capturado dos veces. Juntalo en un solo renglon.` };
      }
      vistos.add(output.id);

      // La referencia que se teclea en la pantalla manda sobre la de la ficha: el dia que se
      // cortaron porciones de 25 g en vez de 20, se captura 25 y el costo sale bien.
      let refQty: Decimal | null = null;
      if (fila.ref) {
        const tecleada = new Decimal(fila.ref);
        if (tecleada.gt(0)) refQty = tecleada;
      }
      refQty ??= resolveRefQtyPerUnit(source.baseUnit, output);
      if (!refQty) {
        return {
          error: `Falta cuanto ${source.baseUnitLabel} de ${source.name} lleva cada ${output.name}. Capturalo en el renglon o en la ficha de la porcion.`,
        };
      }

      outputs.push({
        productId: output.id,
        productName: output.name,
        qty: fila.qty,
        refQtyPerUnit: refQty,
        extraCostPerUnit: output.extraCostPerUnit,
      });
    }

    const calculo = computeTransformation(initialQty, source.grossUnitCost, outputs);

    // Etiqueta nada mas: si todo lo que salio se cuenta por porciones, es un porcionamiento.
    const esPorcionamiento = outputs.some((o) => porId.get(o.productId)?.portionQty);
    const fecha = new Date(`${dateRaw}T00:00:00.000Z`);

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
          type: esPorcionamiento ? "PORTIONING" : "CLEANING",
          date: fecha,
          productId: source.id,
          initialQty: calculo.initialQty.toString(),
          unitCost: new Decimal(source.grossUnitCost).toDecimalPlaces(6).toString(),
          // El rendimiento puede pasar de 100 cuando salio mas de lo capturado; la columna solo
          // guarda hasta 999.99, asi que se recorta para no tumbar el guardado por un tecleo.
          realYieldPct: Decimal.min(calculo.realYieldPct, 999.99).toFixed(2),
          // Con una sola salida se llenan tambien los campos viejos de limpieza: de ahi los lee
          // el kardex del producto que salio.
          outputProductId: calculo.outputs.length === 1 ? calculo.outputs[0].productId : null,
          outputQty: calculo.outputs.length === 1 ? calculo.outputs[0].qty.toString() : null,
          comment,
          createdByUserId: user.id,
          outputs: {
            create: calculo.outputs.map((o, index) => ({
              productId: o.productId,
              qty: o.qty.toString(),
              refQtyPerUnit: o.refQtyPerUnit.toDecimalPlaces(6).toString(),
              extraCostPerUnit: o.extraCostPerUnit.toDecimalPlaces(6).toString(),
              realUnitCost: o.unitCost.toDecimalPlaces(6).toString(),
              sortOrder: index,
            })),
          },
        },
      });

      // El costo de cada producto que salio queda al dia con esta transformacion. Son productos
      // de proceso: nada mas los va a recalcular, porque no tienen compras de donde sacarlo.
      for (const o of calculo.outputs) {
        await tx.product.update({
          where: { id: o.productId },
          data: {
            currentUnitCost: o.unitCost.toDecimalPlaces(6).toString(),
            currentUnitCostUpdatedAt: fecha,
            isProcessed: true,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof TransformationError) return { error: error.message };
    console.error("createTransformation error:", error);
    return {
      error: `No se pudo guardar la transformacion: ${error instanceof Error ? error.message.slice(0, 200) : "error desconocido"}`,
    };
  }

  revalidatePath("/portioning");
  revalidatePath("/products");
  revalidatePath("/recipes");
  redirect("/portioning");
}

/**
 * Lleva el rendimiento medido en una transformacion a la ficha del producto que entro.
 *
 * Es deliberado que esto sea un boton y no algo automatico: antes cada porcionamiento
 * reescribia el rendimiento del producto y recosteaba todas sus compras, asi que un mal corte
 * movia numeros de todo el historial. Ahora el dato se ve, y se aplica cuando quien sabe del
 * negocio decide que ese si es el rendimiento de verdad.
 */
export async function aplicarRendimientoAlCatalogo(entryId: string) {
  const user = await requireSucursalContext();

  const entry = await prisma.portioningEntry.findFirst({
    where: { id: entryId, organizationId: user.organizationId },
    include: { product: { select: { id: true, baseUnit: true } } },
  });
  if (!entry) throw new Error("Transformacion no encontrada.");

  const rendimiento = new Decimal(entry.realYieldPct.toString());
  if (rendimiento.lte(0) || rendimiento.gt(100)) {
    // Un rendimiento mayor a 100 significa que salio mas de lo que se capturo que entro: ese
    // dato no sirve como rendimiento del producto.
    throw new Error("Ese rendimiento no se puede usar en el catalogo: revisa lo que entro.");
  }

  await prisma.product.update({
    where: { id: entry.product.id },
    data: { yieldPercentage: rendimiento.toFixed(2) },
  });
  await recalcProductCostsForYield(
    entry.product.id,
    entry.product.baseUnit as UnitValue,
    rendimiento,
  );

  revalidatePath("/portioning");
  revalidatePath("/products");
  revalidatePath("/recipes");
}
