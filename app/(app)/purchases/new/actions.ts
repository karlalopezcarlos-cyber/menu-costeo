"use server";

import { requireSucursalContext } from "@/lib/tenant";
import { leerCfdi } from "@/lib/compras/cfdi";
import { leerNotaDeFoto } from "@/lib/compras/foto-ia";

/**
 * Lee del papel adjunto lo unico que la captura a mano necesita saber: cuanto dice el total.
 *
 * Quien captura a mano ya tiene el papel enfrente y va tecleando de ahi; lo que falla no es
 * leerlo, es equivocarse en un renglon y no darse cuenta. Por eso aqui no se arman renglones
 * (para eso esta Subir XML o foto): se saca el total y se compara contra lo capturado, que es
 * la unica comprobacion que de verdad atrapa el error.
 */

export type TotalDelPapel = {
  total?: string;
  retenciones?: string;
  avisos?: string[];
  error?: string;
};

const MAX_BYTES = 4.5 * 1024 * 1024;

const TIPOS_IMAGEN = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
} as const;

export async function leerTotalDelPapel(formData: FormData): Promise<TotalDelPapel> {
  await requireSucursalContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo." };
  if (file.size > MAX_BYTES) {
    return { error: "El archivo pesa demasiado. Si es una foto, mandala desde el telefono: la encoge sola." };
  }

  const esXml =
    file.type.includes("xml") || file.name.toLowerCase().endsWith(".xml");

  if (esXml) {
    let texto: string;
    try {
      texto = await file.text();
    } catch {
      return { error: "No se pudo leer el archivo. Vuelve a elegirlo." };
    }
    const resultado = leerCfdi(texto);
    if ("error" in resultado) return { error: resultado.error };
    return {
      total: resultado.borrador.total ?? undefined,
      retenciones: resultado.borrador.retenciones ?? undefined,
      avisos: resultado.borrador.avisos,
    };
  }

  const mediaType = TIPOS_IMAGEN[file.type as keyof typeof TIPOS_IMAGEN];
  if (!mediaType) return { error: "Esa imagen no se puede leer. Usa una foto en JPG o PNG." };

  let base64: string;
  try {
    base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  } catch {
    return { error: "No se pudo leer la foto. Vuelve a elegirla." };
  }

  const resultado = await leerNotaDeFoto(base64, mediaType);
  if ("error" in resultado) return { error: resultado.error };

  if (!resultado.borrador.total) {
    return { error: "No se alcanzo a leer el total de la nota. Se va a guardar el papel, pero sin comparar." };
  }
  return { total: resultado.borrador.total, avisos: resultado.borrador.avisos };
}
