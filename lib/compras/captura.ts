import Decimal from "decimal.js";
import type { UnitValue } from "@/lib/units";
import { pluralizar } from "./plural";
import type { OpcionBulto, OpcionProducto, UnidadCaptura } from "./importar-tipos";

/**
 * De lo que se teclea a lo que se guarda.
 *
 * Capturar "3 botellas" es comodo para cotejar contra el papel, pero el costo y el inventario
 * viven en una unidad de medida. La multiplicacion esta aqui, aparte de la pantalla, porque es
 * la parte que hace cuentas: de este numero sale el costo unitario del producto, de ahi el
 * costo de cada platillo que lo usa y de ahi el Estado de Resultados. Una cuenta mal hecha
 * aqui no se ve en pantalla, se ve tres meses despues en un margen que no cuadra.
 */

const PREFIJO_BULTO = "PRES:";

export function esBulto(unidad: UnidadCaptura): boolean {
  return unidad.startsWith(PREFIJO_BULTO);
}

export function bultoDe(unidad: UnidadCaptura, producto: OpcionProducto): OpcionBulto | null {
  if (!esBulto(unidad)) return null;
  const id = unidad.slice(PREFIJO_BULTO.length);
  return producto.bultos.find((b) => b.id === id) ?? null;
}

export function decimalDe(texto: string): Decimal | null {
  try {
    const n = new Decimal(texto || "0");
    return n.isFinite() ? n : null;
  } catch {
    return null;
  }
}

function cifras(d: Decimal): string {
  return d.toDecimalPlaces(4).toNumber().toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

/** Lo que de verdad se va a guardar en la compra, ya convertido a una unidad de medida. */
export type Convertido = {
  presentationQty: string;
  presentationUnit: UnitValue;
  presentationLabel: string;
  /** El bulto con el que se capturo, cuando se capturo por bulto. */
  bulto: OpcionBulto | null;
};

export function convertirCaptura(
  cantidadTexto: string,
  unidad: UnidadCaptura,
  producto: OpcionProducto | undefined,
): Convertido | null {
  if (!producto) return null;
  const cantidad = decimalDe(cantidadTexto);
  if (!cantidad || cantidad.lte(0)) return null;

  if (esBulto(unidad)) {
    const bulto = bultoDe(unidad, producto);
    if (!bulto) return null;
    const contenido = decimalDe(bulto.quantity);
    if (!contenido || contenido.lte(0)) return null;
    const etiqueta = cantidad.equals(1) ? bulto.label : pluralizar(bulto.label);
    return {
      presentationQty: cantidad.times(contenido).toString(),
      presentationUnit: bulto.unit,
      presentationLabel: `${cifras(cantidad)} ${etiqueta}`,
      bulto,
    };
  }

  if (!unidad) return null;
  return {
    presentationQty: cantidad.toString(),
    // Ya se descarto el bulto y el vacio: lo que queda es una unidad de medida.
    presentationUnit: unidad as UnitValue,
    // Sin etiqueta: createPurchase arma el texto ("2 KG") con la cantidad y la unidad.
    presentationLabel: "",
    bulto: null,
  };
}

/** La asociacion que se va a recordar de un renglon ya resuelto, o null si no da para una. */
export type AsociacionParaGuardar = {
  descripcion: string;
  unidadDocumento: string;
  productId: string;
  factor: string;
  presentationUnit: UnitValue;
  presentationLabel: string | null;
};

export function asociacionDeRenglon(
  renglon: {
    descripcion: string;
    unidadDocumento: string;
    cantidadDocumento: string;
    cantidad: string;
    productId: string;
  },
  convertido: Convertido,
): AsociacionParaGuardar | null {
  const cantidadDoc = decimalDe(renglon.cantidadDocumento);
  const capturada = decimalDe(renglon.cantidad);
  const final = decimalDe(convertido.presentationQty);
  // Sin la cantidad del papel no hay con que armar el factor: la asociacion guarda cuanto es
  // UNA unidad del documento, para que siga sirviendo cuando llegue otra cantidad.
  if (!cantidadDoc || cantidadDoc.lte(0) || !capturada || !final) return null;

  // La etiqueta del bulto solo se guarda cuando se capturo la misma cantidad que decia el
  // papel: si fueron 2 cajas para 3 que decia la factura, volver a ofrecer cajas la proxima
  // vez seria repetir la correccion al reves. En ese caso manda el factor.
  const mismaCantidad = capturada.equals(cantidadDoc);

  return {
    descripcion: renglon.descripcion,
    unidadDocumento: renglon.unidadDocumento,
    productId: renglon.productId,
    factor: final.dividedBy(cantidadDoc).toDecimalPlaces(8).toString(),
    presentationUnit: convertido.presentationUnit,
    presentationLabel: mismaCantidad && convertido.bulto ? convertido.bulto.label : null,
  };
}
