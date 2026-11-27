import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { UNITS, type UnitValue } from "@/lib/units";
import { claveDeAsociacion } from "./emparejar";

/**
 * Lo que una compra subida por XML o por foto deja guardado aparte de los renglones: las
 * asociaciones confirmadas y el documento original.
 *
 * Vive fuera de createPurchase, pero se escribe DENTRO de su transaccion, por dos razones:
 * el documento se archiva por folio y el folio nace ahi; y una asociacion que quedo guardada
 * de una compra que al final no se grabo seria una correccion aprendida de la nada.
 *
 * Nada de esto es obligatorio. La captura a mano no manda ninguno de los dos campos y guarda
 * exactamente igual que antes.
 */

export type AsociacionNueva = {
  claveDescripcion: string;
  descripcion: string;
  unidadDocumento: string;
  productId: string;
  factor: string;
  presentationUnit: UnitValue;
  presentationLabel: string | null;
};

export type DocumentoNuevo = {
  tipo: "FOTO" | "XML";
  mimeType: string;
  nombre: string | null;
  contenido: Uint8Array<ArrayBuffer>;
};

const MAX_BYTES = 4.5 * 1024 * 1024;

const MIMES_FOTO: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

/**
 * Lee las asociaciones que manda la pantalla de revision.
 *
 * Lo que no se entienda se descarta en silencio: esto es memoria para la proxima vez, y que
 * un renglon raro no se aprenda es mucho mejor que tirar una compra que ya esta revisada.
 */
export function leerAsociaciones(crudo: unknown, productIdsValidos: Set<string>): AsociacionNueva[] {
  if (typeof crudo !== "string" || !crudo.trim()) return [];

  let lista: unknown;
  try {
    lista = JSON.parse(crudo);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];

  const porClave = new Map<string, AsociacionNueva>();
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const fila = item as Record<string, unknown>;

    const descripcion = texto(fila.descripcion, 300);
    const productId = texto(fila.productId, 60);
    if (!descripcion || !productIdsValidos.has(productId)) continue;

    const presentationUnit = texto(fila.presentationUnit, 20);
    if (!(UNITS as readonly string[]).includes(presentationUnit)) continue;

    let factor: Decimal;
    try {
      factor = new Decimal(texto(fila.factor, 40) || "0");
    } catch {
      continue;
    }
    if (!factor.isFinite() || factor.lte(0)) continue;

    const unidadDocumento = texto(fila.unidadDocumento, 40);
    const clave = claveDeAsociacion(descripcion);
    if (!clave) continue;

    // Dos renglones del mismo documento con el mismo texto y la misma unidad son la misma
    // asociacion: manda el ultimo, para no pelearse consigo misma dentro de la transaccion.
    porClave.set(`${clave}|${unidadDocumento.toUpperCase()}`, {
      claveDescripcion: clave,
      descripcion,
      unidadDocumento,
      productId,
      factor: factor.toString(),
      presentationUnit: presentationUnit as UnitValue,
      presentationLabel: texto(fila.presentationLabel, 60) || null,
    });
  }

  return [...porClave.values()];
}

/** Lee el documento original que viene con el envio, si viene alguno. */
export async function leerDocumentoDeCompra(
  archivo: unknown,
  tipoCrudo: unknown,
): Promise<DocumentoNuevo | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  if (archivo.size > MAX_BYTES) return null;

  const tipo = tipoCrudo === "FOTO" ? "FOTO" : tipoCrudo === "XML" ? "XML" : null;
  if (!tipo) return null;

  // El tipo lo pone el navegador y para un XML a veces llega vacio: el que manda es lo que se
  // leyo, que ya paso por el lector de CFDI o por el de fotos.
  const mimeType = tipo === "FOTO" ? MIMES_FOTO[archivo.type] : "application/xml";
  if (!mimeType) return null;

  let contenido: Uint8Array<ArrayBuffer>;
  try {
    contenido = new Uint8Array(await archivo.arrayBuffer());
  } catch {
    return null;
  }

  return {
    tipo,
    mimeType,
    nombre: archivo.name ? archivo.name.slice(0, 200) : null,
    contenido,
  };
}

/**
 * Deja guardadas las asociaciones de una compra que ya se grabo.
 *
 * No se usa upsert porque la llave unica incluye supplierId, que puede ser nulo, y en Postgres
 * dos nulos no chocan: el upsert crearia una fila nueva cada vez que la nota no trae proveedor.
 * Lo que ya existia se actualiza y se le suma un uso, que es como se ve despues cuales de
 * verdad estan trabajando y cuales nomas estorban.
 */
export async function guardarAsociaciones({
  organizationId,
  supplierId,
  createdByUserId,
  asociaciones,
}: {
  organizationId: string;
  supplierId: string | null;
  createdByUserId: string;
  asociaciones: AsociacionNueva[];
}): Promise<void> {
  if (asociaciones.length === 0) return;

  // Las que ya existen, en una sola consulta: una factura de veinte renglones de un proveedor
  // de siempre son veinte asociaciones que ya estaban.
  const previas = await prisma.supplierItemMapping.findMany({
    where: {
      organizationId,
      supplierId,
      claveDescripcion: { in: asociaciones.map((a) => a.claveDescripcion) },
    },
    select: { id: true, claveDescripcion: true, unidadDocumento: true },
  });
  const idPorLlave = new Map(
    previas.map((p) => [`${p.claveDescripcion}|${p.unidadDocumento.trim().toUpperCase()}`, p.id]),
  );

  const ahora = new Date();
  const nuevas: AsociacionNueva[] = [];

  for (const asociacion of asociaciones) {
    const llave = `${asociacion.claveDescripcion}|${asociacion.unidadDocumento.trim().toUpperCase()}`;
    const id = idPorLlave.get(llave);
    if (!id) {
      nuevas.push(asociacion);
      continue;
    }
    await prisma.supplierItemMapping.update({
      where: { id },
      data: {
        descripcion: asociacion.descripcion,
        productId: asociacion.productId,
        factor: asociacion.factor,
        presentationUnit: asociacion.presentationUnit,
        presentationLabel: asociacion.presentationLabel,
        vecesUsada: { increment: 1 },
        lastUsedAt: ahora,
      },
    });
  }

  if (nuevas.length > 0) {
    await prisma.supplierItemMapping.createMany({
      data: nuevas.map((a) => ({
        organizationId,
        supplierId,
        claveDescripcion: a.claveDescripcion,
        descripcion: a.descripcion,
        unidadDocumento: a.unidadDocumento,
        productId: a.productId,
        factor: a.factor,
        presentationUnit: a.presentationUnit,
        presentationLabel: a.presentationLabel,
        vecesUsada: 1,
        lastUsedAt: ahora,
        createdByUserId,
      })),
      // Dos pestanas guardando la misma factura a la vez: la segunda no tiene que tronar.
      skipDuplicates: true,
    });
  }
}
