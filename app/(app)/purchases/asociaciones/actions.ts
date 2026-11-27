"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";

/**
 * Mantenimiento de las asociaciones de documentos de proveedor.
 *
 * Una asociacion es la memoria de una correccion: "cuando la factura de este proveedor dice
 * CEB BCA 20 KG, es el producto Cebolla blanca y cada unidad del papel son 20 KG". Se usan para
 * no volver a emparejar a mano lo mismo cada mes, y por eso tienen que poderse corregir y
 * borrar: una asociacion equivocada se aplicaria sola, callada, en cada compra que llegue.
 */

export type AsociacionState = { error?: string; ok?: string };

export async function actualizarAsociacion(
  _prevState: AsociacionState | undefined,
  formData: FormData,
): Promise<AsociacionState> {
  try {
    const user = await requireSucursalContext();

    const id = String(formData.get("id") ?? "").trim();
    const productId = String(formData.get("productId") ?? "").trim();
    const etiquetaBulto = String(formData.get("presentationLabel") ?? "").trim();
    const unidadCruda = String(formData.get("presentationUnit") ?? "").trim();
    const factorCrudo = String(formData.get("factor") ?? "").trim();

    const asociacion = await prisma.supplierItemMapping.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!asociacion) throw new Error("Esa asociacion ya no existe.");

    const producto = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
      select: {
        id: true,
        baseUnit: true,
        presentationUnitLabel: true,
        presentationUnitQty: true,
        presentations: { select: { label: true, quantity: true, unit: true } },
      },
    });
    if (!producto) throw new Error("Elige un producto del catalogo.");

    let factor: Decimal;
    let presentationUnit: UnitValue;
    let presentationLabel: string | null;

    if (etiquetaBulto) {
      // Por bulto el factor no se teclea: es cuanto trae ese bulto. Si se dejara escribir
      // aparte, la etiqueta diria "Botella" y el numero podria decir otra cosa.
      const bultos = [
        ...(producto.presentationUnitLabel && producto.presentationUnitQty
          ? [
              {
                label: producto.presentationUnitLabel,
                quantity: producto.presentationUnitQty.toString(),
                unit: producto.baseUnit as UnitValue,
              },
            ]
          : []),
        ...producto.presentations.map((p) => ({
          label: p.label,
          quantity: p.quantity.toString(),
          unit: p.unit as UnitValue,
        })),
      ];
      const bulto = bultos.find((b) => b.label === etiquetaBulto);
      if (!bulto) throw new Error("Ese producto ya no tiene esa presentacion configurada.");
      factor = new Decimal(bulto.quantity);
      presentationUnit = bulto.unit;
      presentationLabel = bulto.label;
    } else {
      if (!(UNITS as readonly string[]).includes(unidadCruda)) throw new Error("Elige la unidad.");
      presentationUnit = unidadCruda as UnitValue;
      presentationLabel = null;
      try {
        factor = new Decimal(factorCrudo || "0");
      } catch {
        throw new Error("La cantidad por unidad del documento no es un numero.");
      }
      if (!factor.isFinite() || factor.lte(0)) {
        throw new Error("La cantidad por unidad del documento debe ser mayor a cero.");
      }
    }

    const baseUnit = producto.baseUnit as UnitValue;
    if (UNIT_META[presentationUnit].type !== UNIT_META[baseUnit].type) {
      throw new Error(
        `No se puede pasar de ${UNIT_LABELS[presentationUnit]} a ${UNIT_LABELS[baseUnit]}.`,
      );
    }

    await prisma.supplierItemMapping.update({
      where: { id: asociacion.id },
      data: {
        productId: producto.id,
        factor: factor.toString(),
        presentationUnit,
        presentationLabel,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la asociacion." };
  }

  revalidatePath("/purchases/asociaciones");
  return { ok: "Asociacion guardada." };
}

export async function eliminarAsociacion(id: string): Promise<AsociacionState> {
  try {
    const user = await requireSucursalContext();

    // deleteMany con la organizacion en el where: asi un id de otra organizacion no borra nada
    // en vez de borrar lo ajeno.
    const { count } = await prisma.supplierItemMapping.deleteMany({
      where: { id, organizationId: user.organizationId },
    });
    if (count === 0) throw new Error("Esa asociacion ya no existe.");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo borrar la asociacion." };
  }

  revalidatePath("/purchases/asociaciones");
  return { ok: "Asociacion borrada." };
}
