import Decimal from "decimal.js";
import { XMLParser } from "fast-xml-parser";
import type { BorradorCompra, LineaDocumento } from "./importar-tipos";

/**
 * Lector del XML de una factura (CFDI 3.3 / 4.0).
 *
 * El XML es el documento fiscal: lo que dice es exacto y no hay que adivinarlo. Por eso aqui
 * no hay IA ni heuristica de texto; lo unico que se interpreta despues es a que producto del
 * catalogo corresponde cada renglon, y eso se hace en emparejar.ts con la persona mirando.
 *
 * Se lee con `removeNSPrefix` para no depender del prefijo del namespace: unos PAC emiten
 * `cfdi:Comprobante` y otros `Comprobante` a secas, y las dos son facturas validas.
 *
 * El importe que se toma es SIEMPRE el del concepto menos su descuento, sin impuesto. Es la
 * regla de la casa: el costo del negocio es el subtotal, y el IVA trasladado es acreditable,
 * no costo. Las tasas se guardan aparte para no perderlas.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Un XML con un solo concepto devuelve objeto en vez de arreglo; se normaliza a mano
  // con asArreglo para no depender de la heuristica del parser.
  parseAttributeValue: false,
  trimValues: true,
});

type Nodo = Record<string, unknown>;

function asArreglo(valor: unknown): Nodo[] {
  if (valor === null || valor === undefined) return [];
  return (Array.isArray(valor) ? valor : [valor]).filter(
    (v): v is Nodo => typeof v === "object" && v !== null,
  );
}

function attr(nodo: Nodo | undefined, nombre: string): string | null {
  if (!nodo) return null;
  const valor = nodo[`@_${nombre}`];
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === "" ? null : texto;
}

function decimalDe(texto: string | null): Decimal | null {
  if (!texto) return null;
  try {
    const n = new Decimal(texto);
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

/**
 * La tasa del SAT viene como fraccion ("0.160000"), no como porcentaje. Se guarda en
 * porcentaje porque asi la maneja el resto de la app (Product.ivaRate, Purchase.ivaRate).
 */
function tasaAPorcentaje(texto: string | null): string | null {
  const fraccion = decimalDe(texto);
  if (!fraccion) return null;
  return fraccion.times(100).toDecimalPlaces(2).toString();
}

/** 002 = IVA, 003 = IEPS, en el catalogo c_Impuesto del SAT. */
function tasasDelConcepto(concepto: Nodo): { iva: string | null; ieps: string | null } {
  const impuestos = asArreglo(concepto.Impuestos)[0];
  if (!impuestos) return { iva: null, ieps: null };
  const traslados = asArreglo(impuestos.Traslados).flatMap((t) => asArreglo(t.Traslado));

  let iva: string | null = null;
  let ieps: string | null = null;
  for (const traslado of traslados) {
    const clave = attr(traslado, "Impuesto");
    // Una cuota fija (TipoFactor "Cuota") no es una tasa y no se puede guardar como
    // porcentaje: se deja en null y la compra toma la del catalogo.
    if (attr(traslado, "TipoFactor") === "Cuota") continue;
    if (clave === "002" && iva === null) iva = tasaAPorcentaje(attr(traslado, "TasaOCuota"));
    if (clave === "003" && ieps === null) ieps = tasaAPorcentaje(attr(traslado, "TasaOCuota"));
  }
  // Exento y tasa 0 son distintos fiscalmente pero cuestan lo mismo: 0%.
  if (iva === null && traslados.some((t) => attr(t, "Impuesto") === "002")) iva = "0";
  return { iva, ieps };
}

export type ResultadoCfdi = { borrador: BorradorCompra } | { error: string };

export function leerCfdi(xml: string): ResultadoCfdi {
  let raiz: Nodo;
  try {
    raiz = parser.parse(xml) as Nodo;
  } catch {
    return { error: "No se pudo leer el XML. Revisa que sea el archivo que te mando el proveedor, sin abrirlo ni volverlo a guardar desde Excel." };
  }

  const comprobante = asArreglo(raiz.Comprobante)[0];
  if (!comprobante) {
    return {
      error:
        "Ese XML no es una factura (no trae el nodo Comprobante). Si lo que tienes es el PDF o una foto, subela por el otro camino.",
    };
  }

  const tipo = attr(comprobante, "TipoDeComprobante");
  if (tipo && tipo !== "I") {
    const nombres: Record<string, string> = {
      E: "una nota de credito",
      T: "un traslado",
      N: "una nomina",
      P: "un complemento de pago",
    };
    return {
      error: `Ese XML es ${nombres[tipo] ?? `de tipo ${tipo}`}, no una factura de compra. Aqui solo entran las de tipo Ingreso.`,
    };
  }

  const avisos: string[] = [];

  const moneda = attr(comprobante, "Moneda");
  if (moneda && moneda !== "MXN" && moneda !== "XXX") {
    avisos.push(
      `La factura viene en ${moneda}. Los importes se cargan tal cual, sin convertir a pesos: revisalos antes de guardar.`,
    );
  }

  const emisor = asArreglo(comprobante.Emisor)[0];
  const fechaCompleta = attr(comprobante, "Fecha");
  const fecha = fechaCompleta ? fechaCompleta.slice(0, 10) : null;

  const serie = attr(comprobante, "Serie");
  const folioDoc = attr(comprobante, "Folio");
  const folio = [serie, folioDoc].filter(Boolean).join("-") || null;

  const conceptosNodo = asArreglo(comprobante.Conceptos);
  const conceptos = conceptosNodo.flatMap((c) => asArreglo(c.Concepto));
  if (conceptos.length === 0) {
    return { error: "La factura no trae conceptos. No hay nada que cargar." };
  }

  const lineas: LineaDocumento[] = [];
  conceptos.forEach((concepto, i) => {
    const descripcion = attr(concepto, "Descripcion") ?? "(sin descripcion)";
    const importeBruto = decimalDe(attr(concepto, "Importe"));
    if (!importeBruto) {
      avisos.push(`El renglon ${i + 1} ("${descripcion}") no trae importe y se omitio.`);
      return;
    }
    const descuento = decimalDe(attr(concepto, "Descuento")) ?? new Decimal(0);
    const importe = importeBruto.minus(descuento);
    if (importe.lte(0)) {
      avisos.push(
        `El renglon ${i + 1} ("${descripcion}") queda en cero o en negativo despues del descuento y se omitio.`,
      );
      return;
    }

    const cantidad = decimalDe(attr(concepto, "Cantidad")) ?? new Decimal(1);
    const { iva, ieps } = tasasDelConcepto(concepto);

    lineas.push({
      id: `cfdi-${i}`,
      descripcion,
      cantidad: cantidad.toString(),
      // ClaveUnidad es el codigo del SAT (H87, KGM) y Unidad el texto libre del proveedor
      // ("Pieza", "Kg"). Se prefiere la clave porque es la que no cambia entre proveedores.
      unidadDocumento: attr(concepto, "ClaveUnidad") ?? attr(concepto, "Unidad") ?? "",
      precioUnitario: cantidad.gt(0) ? importe.dividedBy(cantidad).toDecimalPlaces(6).toString() : null,
      importe: importe.toDecimalPlaces(2).toString(),
      ivaRate: iva,
      iepsRate: ieps,
      claveProdServ: attr(concepto, "ClaveProdServ"),
    });
  });

  if (lineas.length === 0) {
    return { error: "Ningun renglon de la factura tenia importe. No hay nada que cargar." };
  }

  const subtotalDoc = decimalDe(attr(comprobante, "SubTotal"));
  const descuentoDoc = decimalDe(attr(comprobante, "Descuento")) ?? new Decimal(0);
  const subtotalNeto = subtotalDoc ? subtotalDoc.minus(descuentoDoc) : null;

  // Cuadre: si la suma de los renglones no da el subtotal de la factura, algo se quedo fuera.
  // No es para bloquear -el documento manda- pero si para que nadie guarde a ciegas.
  if (subtotalNeto) {
    const suma = lineas.reduce((acc, l) => acc.plus(l.importe), new Decimal(0));
    if (!suma.minus(subtotalNeto).abs().lte("0.05")) {
      avisos.push(
        `La suma de los renglones da $${suma.toFixed(2)} y la factura dice $${subtotalNeto.toFixed(2)}. Revisa antes de guardar.`,
      );
    }
  }

  return {
    borrador: {
      origen: "xml",
      fecha,
      folio,
      proveedor: { nombre: attr(emisor, "Nombre"), rfc: attr(emisor, "Rfc") },
      subtotal: subtotalNeto ? subtotalNeto.toDecimalPlaces(2).toString() : null,
      total: decimalDe(attr(comprobante, "Total"))?.toDecimalPlaces(2).toString() ?? null,
      lineas,
      avisos,
    },
  };
}
