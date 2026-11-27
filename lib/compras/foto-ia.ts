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
 * 2. Lo que se le pide es el importe SIN impuesto. Casi ninguna nota de papel desglosa IVA; en
 *    ese caso se le pide que devuelva el importe tal cual y marque `ivaIncluido`, y el calculo
 *    de desglosar lo hace la app, no el modelo: la aritmetica es trabajo de la computadora.
 *
 * 3. Nada se guarda solo. Esto devuelve un borrador que una persona revisa renglon por renglon.
 */

const MODELO = "claude-opus-5-5";

const INSTRUCCIONES = `Eres un lector de notas y facturas de compra de un restaurante en Mexico.

Te dan la foto de una nota, remision o factura impresa. Devuelve lo que ESTA ESCRITO en el papel, nada mas.

Reglas que no se rompen:
- No inventes. Si un numero no se alcanza a leer, deja el campo en null y describe el problema en "ilegible". Nunca pongas un valor "aproximado" o "probable".
- No calcules lo que no esta escrito. Si la nota no dice el precio unitario, deja precioUnitario en null; el importe es lo que importa.
- Transcribe la descripcion del producto tal como viene, con sus abreviaturas ("CEB BCA", "JITOM BOLA"). No la traduzcas ni la "corrijas".
- La cantidad y la unidad van separadas: "2 CAJAS" es cantidad 2, unidad "CAJAS".
- Si la nota desglosa IVA, el importe de cada renglon va SIN IVA y pones ivaIncluido en false.
- Si la nota NO desglosa IVA (lo normal en una nota de papel), copia el importe tal como aparece y pon ivaIncluido en true. No lo dividas tu.
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
    ivaIncluido: {
      type: "boolean",
      description: "true si los importes de los renglones ya traen el IVA adentro porque la nota no lo desglosa.",
    },
    totalEscrito: {
      type: ["string", "null"],
      description: "El total que viene escrito al pie de la nota, tal cual.",
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
  required: ["proveedor", "rfc", "fecha", "folio", "ivaIncluido", "totalEscrito", "lineas", "avisos"],
  additionalProperties: false,
};

export type NotaLeida = {
  proveedor: string | null;
  rfc: string | null;
  fecha: string | null;
  folio: string | null;
  ivaIncluido: boolean;
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
  /** Tasa de IVA con la que se desglosa una nota que no lo separa. */
  ivaPorDefecto: Decimal,
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

  const borrador = armarBorrador(bloque.input as NotaLeida, ivaPorDefecto);
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
 * que hace cuentas (quitarle el IVA al importe, sacar el unitario) y una cuenta mal hecha aqui
 * no se nota en pantalla, se nota tres meses despues en el costo de un platillo.
 */
export function armarBorrador(nota: NotaLeida, ivaPorDefecto: Decimal): BorradorCompra {
  const avisos = Array.isArray(nota.avisos) ? [...nota.avisos] : [];

  // Si la nota no desglosa IVA, el importe escrito lo trae adentro. Desglosarlo es aritmetica,
  // y la aritmetica la hace la app: el modelo solo transcribe.
  const factor = nota.ivaIncluido ? new Decimal(1).plus(ivaPorDefecto.dividedBy(100)) : new Decimal(1);
  if (nota.ivaIncluido && ivaPorDefecto.gt(0)) {
    avisos.push(
      `La nota no desglosa IVA, asi que se le quito el ${ivaPorDefecto.toString()}% a cada importe para dejar el costo sin impuesto. Si esa nota no causa IVA, vuelve a subirla con el IVA en 0.`,
    );
  }

  const lineas: LineaDocumento[] = [];
  (Array.isArray(nota.lineas) ? nota.lineas : []).forEach((linea, i) => {
    const descripcion = (linea.descripcion ?? "").trim() || "(sin descripcion)";
    const importeBruto = decimalDe(linea.importe);

    if (linea.ilegible) {
      avisos.push(`Renglon ${i + 1} ("${descripcion}"): ${linea.ilegible}`);
    }

    const importe = importeBruto ? importeBruto.dividedBy(factor).toDecimalPlaces(2) : null;
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
      importe: importe ? importe.toString() : "",
      // Una nota de papel no desglosa tasas por renglon: se deja al catalogo, que para eso
      // guarda la tasa de cada producto.
      ivaRate: null,
      iepsRate: null,
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
    subtotal: null,
    total: decimalDe(nota.totalEscrito)?.toDecimalPlaces(2).toString() ?? null,
    lineas,
    avisos,
  };
}
