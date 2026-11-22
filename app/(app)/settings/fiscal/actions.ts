"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession, requireSucursalContext } from "@/lib/tenant";
import {
  REGIMENES_FISCALES,
  USOS_CFDI,
  claveProdServValida,
  codigoPostalValido,
  normalizarRfc,
  rfcValido,
} from "@/lib/cfdi";

async function requireOwner() {
  const user = await requireOrgSession();
  if (user.role !== "OWNER") {
    throw new Error("Solo el dueno de la cuenta puede editar los datos fiscales.");
  }
  return user;
}

/**
 * Guarda los datos fiscales de una sucursal.
 *
 * Se puede guardar incompleto a proposito: se capturan en varias sentadas y con la Constancia
 * de Situacion Fiscal enfrente. Lo que no se acepta es un dato mal formado —un RFC con guiones,
 * un CP de cuatro digitos—, porque eso no se detecta hasta que el SAT rechaza el timbre.
 */
export async function updateDatosFiscales(
  sucursalId: string,
  _prevState: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  try {
    const user = await requireOwner();

    const target = await prisma.sucursal.findFirst({
      where: { id: sucursalId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!target) throw new Error("Sucursal no encontrada.");

    const rfcRaw = String(formData.get("rfc") ?? "").trim();
    const rfc = rfcRaw ? normalizarRfc(rfcRaw) : null;
    if (rfc && !rfcValido(rfc)) {
      throw new Error("El RFC no tiene la forma correcta (ej. ABC010101AB1).");
    }

    const razonSocial = String(formData.get("razonSocial") ?? "").trim() || null;

    const regimenFiscal = String(formData.get("regimenFiscal") ?? "").trim() || null;
    if (regimenFiscal && !REGIMENES_FISCALES.some((r) => r.clave === regimenFiscal)) {
      throw new Error("Regimen fiscal no valido.");
    }

    const cp = String(formData.get("codigoPostalFiscal") ?? "").trim() || null;
    if (cp && !codigoPostalValido(cp)) {
      throw new Error("El codigo postal debe ser de 5 digitos.");
    }

    const usoCfdi = String(formData.get("usoCfdi") ?? "").trim() || null;
    if (usoCfdi && !USOS_CFDI.some((u) => u.clave === usoCfdi)) {
      throw new Error("Uso del CFDI no valido.");
    }

    await prisma.sucursal.update({
      where: { id: target.id },
      data: { rfc, razonSocial, regimenFiscal, codigoPostalFiscal: cp, usoCfdi },
    });

    revalidatePath("/settings/fiscal");
    revalidatePath("/internal-sales");
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudieron guardar los datos fiscales.",
    };
  }
}

/**
 * Clave de producto/servicio del SAT de un producto o una subreceta.
 *
 * Vive en el catalogo, no en el precio de traspaso: la clave es del producto y sirve para
 * cualquier factura, no solo para las ventas internas. Se captura desde Precios de traspaso
 * porque es ahi donde hace falta primero.
 */
export async function setClaveProdServ(
  tipo: "product" | "recipe",
  id: string,
  claveRaw: string,
): Promise<{ error?: string }> {
  const user = await requireSucursalContext();

  const texto = claveRaw.trim();
  if (texto !== "" && !claveProdServValida(texto)) {
    return { error: "La clave del SAT son 8 digitos." };
  }
  const clave = texto || null;

  if (tipo === "product") {
    const existe = await prisma.product.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existe) return { error: "Producto no encontrado." };
    await prisma.product.update({ where: { id }, data: { claveProdServ: clave } });
  } else {
    const existe = await prisma.recipe.findFirst({
      where: { id, sucursalId: user.sucursalId, archivedAt: null },
      select: { id: true },
    });
    if (!existe) return { error: "Subreceta no encontrada en esta sucursal." };
    await prisma.recipe.update({ where: { id }, data: { claveProdServ: clave } });
  }

  revalidatePath("/internal-sales/precios");
  return {};
}
