import { prisma } from "@/lib/prisma";
import { ZONA_HORARIA } from "@/lib/format";
import type { Prisma, PurchaseActivityType } from "@/generated/prisma/client";

/**
 * La bitacora de una compra.
 *
 * El precio de una compra es el costo de un insumo, y el costo de un insumo es el costo de
 * cada platillo que lo usa. Cuando un margen sale raro, la primera pregunta es quien movio
 * esto y cuando: sin eso la correccion es anonima y no hay con quien aclararla.
 *
 * Los mensajes se guardan ya redactados a proposito. Si se guardaran los ids y se armara el
 * texto al leerlo, un producto renombrado o un proveedor borrado cambiarian lo que dice la
 * bitacora de hace seis meses, y entonces no es bitacora.
 */

export type EntradaBitacora = {
  id: string;
  tipo: PurchaseActivityType;
  mensaje: string;
  quien: string;
  cuando: Date;
};

type Cliente = Prisma.TransactionClient | typeof prisma;

export async function anotarEnBitacora(
  cliente: Cliente,
  datos: {
    organizationId: string;
    sucursalId: string;
    folio: number;
    type: PurchaseActivityType;
    message: string;
    createdByUserId: string | null;
  },
): Promise<void> {
  // La bitacora nunca tumba la operacion: si falla la anotacion, la compra ya se guardo bien y
  // perder un renglon de historial es mucho menos grave que tirar la captura.
  try {
    await cliente.purchaseActivity.create({ data: datos });
  } catch (error) {
    console.error("No se pudo anotar en la bitacora de la compra:", error);
  }
}

function nombreDe(usuario: { name: string | null; email: string } | null): string {
  if (!usuario) return "Alguien que ya no esta en el sistema";
  return usuario.name?.trim() || usuario.email;
}

/**
 * Lo que hay que mostrar de una compra.
 *
 * Cuando el folio no tiene anotaciones -- toda compra anterior a la bitacora -- se reconstruye
 * el registro a partir de los propios renglones, que siempre han guardado quien los creo y
 * cuando. No es el historial completo (de aquellas no se sabe si alguien las edito despues),
 * y por eso se devuelve marcado como reconstruido en vez de hacerlo pasar por bitacora.
 */
export async function cargarBitacora(
  organizationId: string,
  sucursalId: string,
  folio: number,
): Promise<{ entradas: EntradaBitacora[]; reconstruida: boolean }> {
  const anotaciones = await prisma.purchaseActivity.findMany({
    where: { organizationId, sucursalId, folio },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (anotaciones.length > 0) {
    return {
      entradas: anotaciones.map((a) => ({
        id: a.id,
        tipo: a.type,
        mensaje: a.message,
        quien: nombreDe(a.createdBy),
        cuando: a.createdAt,
      })),
      reconstruida: false,
    };
  }

  const renglones = await prisma.purchase.findMany({
    where: { organizationId, sucursalId, folio },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true, createdBy: { select: { name: true, email: true } } },
  });

  return { entradas: reconstruirRegistro(renglones), reconstruida: true };
}

/**
 * El registro de una compra, sacado de sus propios renglones.
 *
 * Se agrupa por persona y minuto: capturar seis renglones de una factura es un solo acto, no
 * seis, y seis entradas identicas seguidas no dicen nada que una no diga. Pero si los
 * renglones se fueron agregando en ratos distintos, o los capturaron dos personas, eso si
 * sale por separado, que es justo lo que alguien viene a mirar aqui.
 */
export function reconstruirRegistro(
  renglones: { id: string; createdAt: Date; createdBy: { name: string | null; email: string } | null }[],
): EntradaBitacora[] {
  const grupos = new Map<string, { id: string; quien: string; cuando: Date; cuantos: number }>();
  for (const renglon of renglones) {
    const quien = nombreDe(renglon.createdBy);
    const llave = `${quien}|${renglon.createdAt.toISOString().slice(0, 16)}`;
    const previo = grupos.get(llave);
    if (previo) {
      previo.cuantos += 1;
      continue;
    }
    grupos.set(llave, { id: renglon.id, quien, cuando: renglon.createdAt, cuantos: 1 });
  }

  return [...grupos.values()].map((g) => ({
    id: g.id,
    tipo: "REGISTRADA" as PurchaseActivityType,
    mensaje:
      g.cuantos === 1 ? "Registro 1 renglon de esta compra." : `Registro ${g.cuantos} renglones de esta compra.`,
    quien: g.quien,
    cuando: g.cuando,
  }));
}

/** Fecha y hora de la bitacora, en la hora del negocio (ej. "23/11/26, 9:47 p.m."). */
export function momento(valor: Date): string {
  return valor.toLocaleString("es-MX", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * El texto de una edicion: que cambio y de que a que.
 *
 * "Edito la compra" no sirve para nada seis meses despues. Lo que se necesita saber es que el
 * precio pasó de $1,667.53 a $900.00, porque eso es lo que movio el costo del platillo.
 */
export function describirCambios(
  cambios: { campo: string; antes: string; despues: string }[],
): string | null {
  const reales = cambios.filter((c) => c.antes !== c.despues);
  if (reales.length === 0) return null;
  return reales.map((c) => `${c.campo}: ${c.antes || "(vacio)"} → ${c.despues || "(vacio)"}`).join(" · ");
}

/** Una fecha pura (@db.Date) como se escribe en la bitacora. Se lee en UTC, no en la zona. */
export function fechaDeCompra(valor: Date): string {
  return valor.toLocaleDateString("es-MX", { timeZone: "UTC" });
}
