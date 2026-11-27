import Anthropic from "@anthropic-ai/sdk";
import Decimal from "decimal.js";
import type { BorradorCompra, LineaDocumento } from "./importar-tipos";

/**
 * Lector de la foto de una nota de compra.
 *
 * A diferencia del XML, aqui no hay dato exacto: hay una foto de un papel, a veces escrito a
 * mano. Tres decisiones que vienen de eso:
 *
 * 1. El modelo tiene prohibido inventar. Si un renglon no se alcanza a leer, lo devuelve con
 *    lo que si se ve y lo dice en `ilegible`, en vez de completar un numero plausible. Una
 *    cantidad inventada se convierte en costo unitario inventado y de ahi se mete al costo de
 *    todos los platillos que usan ese insumo.
 *
 * 2. El modelo transcribe y no calcula. Copia los importes y los totales del pie tal como
 *    estan escritos, impuestos incluidos; sacar la tasa de ahi es aritmetica, y la aritmetica
 *    la hace la computadora. Antes se le preguntaba a la persona que IVA ponerle a la nota,
 *    con 16% precargado: una nota de mercado que no causa impuesto se guardaba con 16% de
 *    menos en el costo nomas porque nadie bajo a cambiar el numero.
 *
 * 3. Cuando la nota no desglosa el IVA no se adivina: el borrador lo dice y la pantalla le
 *    pregunta a la persona si los precios ya lo traen adentro.
 *
 * 4. Nada se guarda solo. Esto devuelve un borrador que una persona revisa renglon por renglon.
 */

const MODELO = "claude-opus-5-5";

const INSTRUCCIONES = `Eres un lector de notas y facturas de compra de un restaurante en Mexico.

Te dan la foto de una nota, remision o factura impresa. Devuelve lo que ESTA ESCRITO en el papel, nada mas.

Reglas que no se rompen:
- No inventes. Si un numero no se alcanza a leer, deja el campo en null y describe el problema en "ilegible". Nunca pongas un valor "aproximado" o "probable".
- No calcules lo que no esta escrito. Si la nota no dice el precio unitario, deja precioUnitario en null; el importe es lo que importa.
- Transcribe la descripcion del producto tal como viene, con sus abreviaturas ("CEB BCA", "JITOM BOLA"). No la traduzcas ni la "corrijas".
- La cantidad y la unidad van separadas: "2 CAJAS" es cantidad 2, unidad "CAJAS".
- Copia el importe de cada renglon TAL COMO APARECE en el papel. Nunca le sumes ni le quites impuesto: esa cuenta la hace la app.
- Al pie de la nota hay casi siempre unos totales. Copialos tal cual en subtotalEscrito, ivaEscrito, iepsEscrito y totalEscrito. El que no venga escrito va en null; no lo calcules tu.
- totalEscrito es lo que se le paga al proveedor, el numero mas grande del pie. Es el dato mas importante de la nota: si no se alcanza a leer, ponlo en null y dilo en "avisos".
- Si en la foto hay varias notas distintas, lee solo la que esta completa y al frente, y dilo en "avisos".
- La fecha va en formato AAAA-MM-DD. Si el papel trae la fecha sin anio, usa null.

Llama siempre a la herramienta registrar_nota con lo que leiste.`;

const ESQUEMA = {
  type: "object" as const,
  properties: {
    proveedor: {
      type: ["string", "null"],
      description: "Nombre del negocio que vende, como aparece en la nota.",
    },
    rfc: { type: ["string", "null"], description: "RFC del proveedor si aparece." },
    fecha: { type: ["string", "null"], description: "AAAA-MM-DD, o null si no se lee." },
    folio: { type: ["string", "null"], description: "Folio o numero de la nota." },
    subtotalEscrito: {
      type: ["string", "null"],
      description: "El subtotal escrito al pie de la nota, tal cual. null si la nota no lo trae.",
    },
    ivaEscrito: {
      type: ["string", "null"],
      description: "El monto de IVA escrito al pie de la nota, tal cual. null si la nota no lo desglosa.",
    },
    iepsEscrito: {
      type: ["string", "null"],
      description: "El monto de IEPS escrito al pie de la nota, tal cual. null si no viene.",
    },
    totalEscrito: {
      type: ["string", "null"],
      description: "El total a pagar escrito al pie de la nota, tal cual.",
    },
    lineas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" },
          cantidad: { type: ["string", "null"] },
          unidad: { type: ["string", "null"], description: "PZA, KG, CAJA, MANOJO, lo que diga." },
          precioUnitario: { type: ["string", "null"] },
          importe: { type: ["string", "null"] },
          ilegible: {
            type: ["string", "null"],
            description: "Que parte de este renglon no se alcanza a leer. null si se leyo completo.",
          },
        },
        required: ["descripcion", "cantidad", "unidad", "precioUnitario", "importe", "ilegible"],
        additionalProperties: false,
      },
    },
    avisos: {
      type: "array",
      items: { type: "string" },
      description: "Lo que la persona deberia mirar: foto borrosa, nota cortada, renglones tachados.",
    },
  },
  required: [
    "proveedor",
    "rfc",
    "fecha",
    "folio",
    "subtotalEscrito",
    "ivaEscrito",
    "iepsEscrito",
    "totalEscrito",
    "lineas",
    "avisos",
  ],
  additionalProperties: false,
};

export type NotaLeida = {
  proveedor: string | null;
  rfc: string | null;
  fecha: string | null;
  folio: string | null;
  subtotalEscrito: string | null;
  ivaEscrito: string | null;
  iepsEscrito: string | null;
  totalEscrito: string | null;
  lineas: {
    descripcion: string;
    cantidad: string | null;
    unidad: string | null;
    precioUnitario: string | null;
    importe: string | null;
    ilegible: string | null;
  }[];
  avisos: string[];
};

function decimalDe(texto: string | null | undefined): Decimal | null {
  if (!texto) return null;
  const limpio = String(texto).replace(/[$\s]/g, "").replace(/,/g, "");
  try {
    const n = new Decimal(limpio);
    return n.isFinite() && n.gte(0) ? n : null;
  } catch {
    return null;
  }
}

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

export type ResultadoFoto = { borrador: BorradorCompra } | { error: string };

export async function leerNotaDeFoto(
  imagenBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<ResultadoFoto> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error:
        "La lectura con IA no esta configurada todavia (falta ANTHROPIC_API_KEY). El XML si funciona sin eso.",
    };
  }

  const client = new Anthropic();

  let respuesta;
  try {
    respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: INSTRUCCIONES,
      output_config: { effort: "high" },
      tools: [
        {
          name: "registrar_nota",
          description: "Registra lo que dice la nota de compra de la foto.",
          strict: true,
          input_schema: ESQUEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imagenBase64 } },
            { type: "text", text: "Lee esta nota de compra y registrala." },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { error: "La llave de la IA no es valida o vencio. Hay que reponerla para poder leer fotos." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { error: "La IA esta saturada en este momento. Vuelve a intentarlo en un minuto." };
    }
    console.error("foto-ia error:", error);
    return { error: "No se pudo leer la foto. Intentalo otra vez; si sigue fallando, captura la compra a mano." };
  }

  if (respuesta.stop_reason === "refusal") {
    return { error: "La IA no pudo procesar esa imagen. Toma la foto de nuevo, de frente y con buena luz." };
  }

  const bloque = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloque || bloque.type !== "tool_use") {
    return {
      error:
        "La IA no reconocio una nota de compra en la foto. Revisa que se vea el papel completo, de frente y con buena luz.",
    };
  }

  const borrador = armarBorrador(bloque.input as NotaLeida);
  if (borrador.lineas.length === 0) {
    return {
      error: "No se alcanzo a leer ningun renglon en la foto. Tomala de nuevo, de frente y con buena luz.",
    };
  }
  return { borrador };
}

/**
 * Convierte lo que transcribio el modelo en el borrador que revisa la persona.
 *
 * Esta separado de la llamada a la IA para poder probarlo sin gastar una llamada: es la parte
 * que hace cuentas (sacar la tasa de los totales del pie, el unitario) y una cuenta mal hecha
 * aqui no se nota en pantalla, se nota tres meses despues en el costo de un platillo.
 *
 * La tasa sale de lo que dice el papel, no de una preferencia: si la nota trae subtotal, IVA y
 * total, la tasa es la division de esos numeros. El IEPS entra primero a la base, como en la
 * ley y como en el resto de la app (lib/taxes.ts).
 */
export function armarBorrador(nota: NotaLeida): BorradorCompra {
  const avisos = Array.isArray(nota.avisos) ? [...nota.avisos] : [];

  const subtotalEscrito = decimalDe(nota.subtotalEscrito);
  const ivaEscrito = decimalDe(nota.ivaEscrito);
  const iepsEscrito = decimalDe(nota.iepsEscrito);
  const totalEscrito = decimalDe(nota.totalEscrito);

  // La nota desglosa impuestos cuando trae el IVA escrito y un subtotal contra el cual medirlo.
  const desglosaIva = Boolean(ivaEscrito && subtotalEscrito && subtotalEscrito.gt(0));

  let tasaIva: string | null = null;
  let tasaIeps: string | null = null;
  if (desglosaIva && subtotalEscrito && ivaEscrito) {
    const ieps = iepsEscrito ?? new Decimal(0);
    tasaIeps = ieps.times(100).dividedBy(subtotalEscrito).toDecimalPlaces(2).toString();
    tasaIva = ivaEscrito
      .times(100)
      .dividedBy(subtotalEscrito.plus(ieps))
      .toDecimalPlaces(2)
      .toString();
  } else if (!totalEscrito) {
    avisos.push(
      "No se leyo el total de la nota: capturalo antes de guardar, porque es contra ese numero que tiene que cuadrar la compra.",
    );
  }

  const lineas: LineaDocumento[] = [];
  (Array.isArray(nota.lineas) ? nota.lineas : []).forEach((linea, i) => {
    const descripcion = (linea.descripcion ?? "").trim() || "(sin descripcion)";
    const importe = decimalDe(linea.importe);

    if (linea.ilegible) {
      avisos.push(`Renglon ${i + 1} ("${descripcion}"): ${linea.ilegible}`);
    }

    const cantidad = decimalDe(linea.cantidad);

    lineas.push({
      id: `foto-${i}`,
      descripcion,
      cantidad: cantidad ? cantidad.toString() : "",
      unidadDocumento: (linea.unidad ?? "").trim(),
      precioUnitario:
        importe && cantidad && cantidad.gt(0)
          ? importe.dividedBy(cantidad).toDecimalPlaces(6).toString()
          : null,
      // Tal como viene en el papel. Cuando la nota no desglosa, estos importes pueden traer el
      // impuesto adentro y la pantalla pregunta antes de dejar guardar.
      importe: importe ? importe.toDecimalPlaces(2).toString() : "",
      ivaRate: tasaIva,
      iepsRate: tasaIeps,
      claveProdServ: null,
    });
  });

  const fecha = nota.fecha && FECHA_VALIDA.test(nota.fecha) ? nota.fecha : null;
  if (!fecha) avisos.push("No se leyo la fecha de la nota: ponla tu antes de guardar.");

  return {
    origen: "foto",
    fecha,
    folio: nota.folio?.trim() || null,
    proveedor: { nombre: nota.proveedor?.trim() || null, rfc: nota.rfc?.trim() || null },
    subtotal: subtotalEscrito ? subtotalEscrito.toDecimalPlaces(2).toString() : null,
    total: totalEscrito ? totalEscrito.toDecimalPlaces(2).toString() : null,
    desglosaIva,
    // Una nota de papel no trae retenciones.
    retenciones: null,
    lineas,
    avisos,
  };
}
