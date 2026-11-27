import Decimal from "decimal.js";
import { UNIT_META, UNIT_LABELS, type UnitValue } from "@/lib/units";
import type {
  BorradorCompra,
  CompraResuelta,
  Coincidencia,
  LineaResuelta,
  OpcionProducto,
  OpcionProveedor,
} from "./importar-tipos";

/**
 * Cruza lo que decia el documento contra el catalogo: a que proveedor corresponde, a que
 * producto va cada renglon y como se traduce "2 CAJAS" a la unidad en la que la app mide.
 *
 * Esto propone, no decide. Todo lo que sale de aqui se pinta en una pantalla donde la persona
 * corrige antes de guardar, y un renglon que no se pudo resolver sale marcado con el problema
 * en espanol en vez de resuelto a medias. Equivocarse de producto al emparejar no se queda en
 * la compra: se va al costo unitario del producto, de ahi al costo de cada platillo que lo usa
 * y de ahi al Estado de Resultados.
 */

/** Sin acentos, sin puntuacion y con espacios colapsados, para poder comparar nombres. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Claves del catalogo c_ClaveUnidad del SAT y las abreviaturas que de verdad se escriben en
 * una nota de papel. Lo que no esta aqui se trata como "bulto": una caja, un manojo o una
 * bolsa no son una unidad de medida, son un empaque, y cuanto traen depende del producto.
 */
const UNIDAD_POR_TEXTO: Record<string, UnitValue> = {
  // SAT
  KGM: "KG",
  GRM: "G",
  LTR: "L",
  MLT: "ML",
  ONZ: "OZ",
  H87: "PIECE",
  EA: "PIECE",
  C62: "PIECE",
  PCE: "PIECE",
  // Texto libre
  KG: "KG",
  KGS: "KG",
  KILO: "KG",
  KILOS: "KG",
  KILOGRAMO: "KG",
  KILOGRAMOS: "KG",
  G: "G",
  GR: "G",
  GRS: "G",
  GRAMO: "G",
  GRAMOS: "G",
  L: "L",
  LT: "L",
  LTS: "L",
  LITRO: "L",
  LITROS: "L",
  ML: "ML",
  MILILITRO: "ML",
  MILILITROS: "ML",
  OZ: "OZ",
  ONZA: "OZ",
  ONZAS: "OZ",
  PZA: "PIECE",
  PZ: "PIECE",
  PZS: "PIECE",
  PIEZA: "PIECE",
  PIEZAS: "PIECE",
  PIECE: "PIECE",
  UNIDAD: "PIECE",
  UNIDADES: "PIECE",
  UND: "PIECE",
  U: "PIECE",
};

function unidadDeTexto(texto: string): UnitValue | null {
  return UNIDAD_POR_TEXTO[normalizar(texto).replace(/ /g, "")] ?? null;
}

/**
 * Que tan parecidos son dos nombres, de 0 a 1, por palabras compartidas.
 *
 * Se compara por palabra y no letra por letra porque asi es como difieren de verdad estos
 * nombres: la factura dice "ACEITE OLIVA EXTRA VIRGEN 5LT" y el catalogo "ACEITE DE OLIVA
 * GALON 5LT". Las palabras de una sola letra y las de union no cuentan.
 */
const VACIAS = new Set(["DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "CON", "EN", "POR", "A"]);

function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p.length > 1 && !VACIAS.has(p));
}

function parecido(a: string, b: string): number {
  const pa = palabras(a);
  const pb = palabras(b);
  if (pa.length === 0 || pb.length === 0) return 0;
  const setB = new Set(pb);
  let comunes = 0;
  for (const palabra of new Set(pa)) {
    if (setB.has(palabra)) comunes++;
  }
  // Sobre la lista mas corta: que el catalogo tenga el nombre mas largo no debe castigar.
  return comunes / Math.min(new Set(pa).size, setB.size);
}

/** Debajo de esto no se propone nada: mas vale pedir que elija que proponerle lo que no es. */
const UMBRAL_PARECIDO = 0.6;

/**
 * Plural en espanol, lo suficiente para una etiqueta de presentacion: "Botella" -> "Botellas",
 * "Galon" -> "Galones". No es gramatica completa (no acentua "Galon" ni sabe de "Z" final),
 * pero "3 Galons" en una compra se ve a mal hecho y esto cuesta tres lineas.
 */
function pluralizar(etiqueta: string): string {
  const limpia = etiqueta.trim();
  if (!limpia) return limpia;
  return /[aeiouaeiou]$/i.test(limpia) ? `${limpia}s` : `${limpia}es`;
}

function buscarProducto(
  descripcion: string,
  productos: OpcionProducto[],
): { producto: OpcionProducto; coincidencia: Coincidencia } | null {
  const objetivo = normalizar(descripcion);

  const exacto = productos.find((p) => normalizar(p.name) === objetivo);
  if (exacto) return { producto: exacto, coincidencia: "exacta" };

  let mejor: { producto: OpcionProducto; puntaje: number } | null = null;
  let empatado = false;
  for (const producto of productos) {
    const puntaje = parecido(descripcion, producto.name);
    if (!mejor || puntaje > mejor.puntaje) {
      mejor = { producto, puntaje };
      empatado = false;
    } else if (mejor && puntaje === mejor.puntaje) {
      empatado = true;
    }
  }

  // Un empate quiere decir que hay dos productos igual de parecidos: proponer uno al azar es
  // peor que no proponer nada, porque se ve resuelto y nadie lo revisa.
  if (!mejor || mejor.puntaje < UMBRAL_PARECIDO || empatado) return null;
  return { producto: mejor.producto, coincidencia: "parecida" };
}

function buscarProveedor(
  nombre: string | null,
  rfc: string | null,
  proveedores: (OpcionProveedor & { rfc: string | null })[],
): OpcionProveedor | null {
  if (rfc) {
    const porRfc = proveedores.find(
      (p) => p.rfc && p.rfc.trim().toUpperCase() === rfc.trim().toUpperCase(),
    );
    if (porRfc) return { id: porRfc.id, name: porRfc.name };
  }
  if (!nombre) return null;
  const objetivo = normalizar(nombre);
  const exacto = proveedores.find((p) => normalizar(p.name) === objetivo);
  if (exacto) return { id: exacto.id, name: exacto.name };

  let mejor: { proveedor: OpcionProveedor; puntaje: number } | null = null;
  for (const proveedor of proveedores) {
    const puntaje = parecido(nombre, proveedor.name);
    if (!mejor || puntaje > mejor.puntaje) mejor = { proveedor, puntaje };
  }
  return mejor && mejor.puntaje >= UMBRAL_PARECIDO ? mejor.proveedor : null;
}

/**
 * Traduce "2 CAJAS" o "5 KG" a la cantidad y unidad con las que Compras calcula el costo.
 *
 * Tres caminos, en este orden:
 * 1. La unidad del papel mide lo mismo que la unidad base del producto (KG contra KG, LT
 *    contra ML): se usa tal cual y la app convierte.
 * 2. El papel viene por bulto (piezas, cajas, botellas) y el producto tiene capturado cuanto
 *    trae su presentacion: se multiplica.
 * 3. Ninguno de los dos: se deja el renglon marcado para que la persona lo resuelva. No se
 *    adivina una equivalencia.
 */
function traducirCantidad(
  cantidadTexto: string,
  unidadTexto: string,
  producto: OpcionProducto,
): { qty: string; unit: UnitValue | ""; label: string; problema: string | null } {
  let cantidad: Decimal;
  try {
    cantidad = new Decimal(cantidadTexto || "0");
  } catch {
    cantidad = new Decimal(0);
  }
  if (!cantidad.isFinite() || cantidad.lte(0)) {
    return { qty: "", unit: "", label: "", problema: "No se leyo la cantidad: capturala." };
  }

  const baseUnit = producto.baseUnit;
  const unidad = unidadDeTexto(unidadTexto);

  if (unidad && UNIT_META[unidad].type === UNIT_META[baseUnit].type) {
    return {
      qty: cantidad.toString(),
      unit: unidad,
      label: `${cantidad.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[unidad]}`,
      problema: null,
    };
  }

  // Viene por bulto: piezas, cajas, botellas, manojos. Solo se puede convertir si el producto
  // tiene capturado cuanto trae su presentacion.
  const contenido = producto.presentationUnitQty ? new Decimal(producto.presentationUnitQty) : null;
  if (contenido && contenido.gt(0)) {
    const etiqueta = producto.presentationUnitLabel ?? "presentacion";
    const piezas = cantidad.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 });
    return {
      qty: cantidad.times(contenido).toString(),
      unit: baseUnit,
      label: `${piezas} ${cantidad.equals(1) ? etiqueta : pluralizar(etiqueta)}`,
      problema: null,
    };
  }

  const comoViene = unidadTexto.trim() || "sin unidad";
  return {
    qty: "",
    unit: "",
    label: "",
    problema: `El documento dice "${comoViene}" y ${producto.name} se mide en ${UNIT_LABELS[baseUnit]}. Captura cuanto llego en ${UNIT_LABELS[baseUnit]}, o configurale la presentacion al producto.`,
  };
}

export function resolverBorrador(
  borrador: BorradorCompra,
  productos: OpcionProducto[],
  proveedores: (OpcionProveedor & { rfc: string | null })[],
): CompraResuelta {
  const proveedor = buscarProveedor(borrador.proveedor.nombre, borrador.proveedor.rfc, proveedores);

  const lineas: LineaResuelta[] = borrador.lineas.map((linea) => {
    const encontrado = buscarProducto(linea.descripcion, productos);
    if (!encontrado) {
      return {
        ...linea,
        productId: null,
        productoNombre: null,
        coincidencia: "ninguna" as const,
        presentationQty: "",
        presentationUnit: "" as const,
        presentationLabel: "",
        problema: "Elige a que producto del catalogo corresponde.",
      };
    }

    const { producto, coincidencia } = encontrado;
    const traducido = traducirCantidad(linea.cantidad, linea.unidadDocumento, producto);

    let problema = traducido.problema;
    if (!problema) {
      try {
        if (new Decimal(linea.importe || "0").lte(0)) problema = "No se leyo el importe: capturalo.";
      } catch {
        problema = "El importe no es un numero: capturalo.";
      }
    }

    return {
      ...linea,
      productId: producto.id,
      productoNombre: producto.name,
      coincidencia,
      presentationQty: traducido.qty,
      presentationUnit: traducido.unit,
      presentationLabel: traducido.label,
      problema,
    };
  });

  return {
    origen: borrador.origen,
    fecha: borrador.fecha,
    folio: borrador.folio,
    subtotal: borrador.subtotal,
    total: borrador.total,
    proveedor: {
      nombre: borrador.proveedor.nombre,
      rfc: borrador.proveedor.rfc,
      supplierId: proveedor?.id ?? null,
      sinCatalogo: Boolean(borrador.proveedor.nombre) && !proveedor,
    },
    lineas,
    avisos: borrador.avisos,
  };
}
