"use server";

import { requireSucursalContext } from "@/lib/tenant";
import { leerCfdi } from "@/lib/compras/cfdi";
import { leerNotaDeFoto } from "@/lib/compras/foto-ia";
import { resolverBorrador } from "@/lib/compras/emparejar";
import { cargarCatalogoDeCompras } from "@/lib/compras/catalogo";
import type { CompraResuelta } from "@/lib/compras/importar-tipos";

export type LeerState = {
  error?: string;
  compra?: CompraResuelta;
};

const MAX_BYTES = 4.5 * 1024 * 1024;

const TIPOS_IMAGEN = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
} as const;

/**
 * Lee el documento y devuelve un borrador para revisar. No escribe nada.
 *
 * Guardar la compra es el paso siguiente y lo hace createPurchase, el mismo de la captura a
 * mano: el costo unitario, las tasas congeladas, el folio y el credito al pedido salen de ahi.
 * Si esto guardara por su cuenta, habria dos lugares donde se calcula un costo de compra y
 * tarde o temprano dirian cosas distintas.
 */
export async function leerDocumento(
  _prevState: LeerState | undefined,
  formData: FormData,
): Promise<LeerState> {
  const user = await requireSucursalContext();

  const modo = String(formData.get("modo") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: modo === "foto" ? "Elige la foto de la nota." : "Elige el archivo XML de la factura." };
  }
  if (file.size > MAX_BYTES) {
    return {
      error:
        modo === "foto"
          ? "La foto pesa demasiado. Vuelve a tomarla, o mandala desde el telefono, que la encoge sola."
          : "El archivo pesa demasiado para ser un XML de factura. Revisa que sea el archivo correcto.",
    };
  }

  const { productos, proveedores, asociaciones } = await cargarCatalogoDeCompras(
    user.organizationId,
  );

  if (modo === "xml") {
    let texto: string;
    try {
      texto = await file.text();
    } catch {
      return { error: "No se pudo leer el archivo. Vuelve a elegirlo." };
    }
    const resultado = leerCfdi(texto);
    if ("error" in resultado) return { error: resultado.error };
    return { compra: resolverBorrador(resultado.borrador, productos, proveedores, asociaciones) };
  }

  if (modo === "foto") {
    const mediaType = TIPOS_IMAGEN[file.type as keyof typeof TIPOS_IMAGEN];
    if (!mediaType) {
      return { error: "Esa imagen no se puede leer. Usa una foto en JPG o PNG." };
    }

    let base64: string;
    try {
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    } catch {
      return { error: "No se pudo leer la foto. Vuelve a elegirla." };
    }

    const resultado = await leerNotaDeFoto(base64, mediaType);
    if ("error" in resultado) return { error: resultado.error };
    return { compra: resolverBorrador(resultado.borrador, productos, proveedores, asociaciones) };
  }

  return { error: "Indica si vas a subir un XML o una foto." };
}
