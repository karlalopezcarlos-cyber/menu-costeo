import Decimal from "decimal.js";
import { UNIT_META, UNIT_LABELS, type UnitValue } from "@/lib/units";
import type {
  AsociacionGuardada,
  BorradorCompra,
  CompraResuelta,
  Coincidencia,
  LineaResuelta,
  OpcionProducto,
  OpcionProveedor,
  UnidadCaptura,
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
export function normalizar(texto: string): string {
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
 * Cual de los bultos del producto corresponde a lo que dice el papel.
 *
 * Se prefiere el que el papel nombra ("2 CAJAS", "6 BOTELLAS"); si no nombra ninguno, el
 * primero, que es la presentacion fija del producto cuando la tiene.
 */
function bultoParaUnidad(unidadTexto: string, descripcion: string, producto: OpcionProducto) {
  if (producto.bultos.length === 0) return null;

  // Que el papel nombre el bulto es la mejor pista: "2 CAJAS", "6 BOTELLAS".
  const textoUnidad = normalizar(unidadTexto);
  const textoDescripcion = normalizar(descripcion);
  const porNombre = producto.bultos.find((b) => {
    const etiqueta = normalizar(b.label);
    if (!etiqueta) return false;
    return (
      textoUnidad === etiqueta ||
      textoUnidad.startsWith(etiqueta) ||
      textoDescripcion.split(" ").includes(etiqueta)
    );
  });
  if (porNombre) return porNombre;

  // Si no lo nombra, se ofrece el primero (la presentacion fija del producto, cuando tiene).
  // Es un punto de partida que la persona ve y puede cambiar en la lista, no un dato guardado.
  return producto.bultos[0];
}

/**
 * Traduce lo que dice el papel a la casilla de cantidad y su unidad.
 *
 * Lo que devuelve es lo que se CAPTURA, no lo que se guarda: un bulto quiere decir que la
 * cantidad se cuenta en botellas o cajas y la pantalla multiplica por lo que trae cada una.
 * Se prefiere asi porque es como lo lee una persona al cotejar contra la factura: ahi dice
 * "3 Botellas", no "2.1 LT".
 *
 * Tres caminos, en este orden:
 * 1. La unidad del papel mide lo mismo que la unidad base del producto (KG contra KG, LT
 *    contra ML): se usa tal cual y la app convierte.
 * 2. El papel viene por bulto (piezas, cajas, botellas) y el producto tiene configurado al
 *    menos un bulto: se captura en bultos.
 * 3. Ninguno de los dos: se deja el renglon marcado para que la persona lo resuelva. No se
 *    adivina una equivalencia.
 */
function traducirCantidad(
  cantidadTexto: string,
  unidadTexto: string,
  descripcion: string,
  producto: OpcionProducto,
): { cantidad: string; unidad: UnidadCaptura; problema: string | null } {
  let cantidad: Decimal;
  try {
    cantidad = new Decimal(cantidadTexto || "0");
  } catch {
    cantidad = new Decimal(0);
  }
  if (!cantidad.isFinite() || cantidad.lte(0)) {
    return { cantidad: "", unidad: "", problema: "No se leyo la cantidad: capturala." };
  }

  const baseUnit = producto.baseUnit;
  const unidad = unidadDeTexto(unidadTexto);

  if (unidad && UNIT_META[unidad].type === UNIT_META[baseUnit].type) {
    return { cantidad: cantidad.toString(), unidad, problema: null };
  }

  const bulto = bultoParaUnidad(unidadTexto, descripcion, producto);
  if (bulto) {
    return { cantidad: cantidad.toString(), unidad: `PRES:${bulto.id}`, problema: null };
  }

  const comoViene = unidadTexto.trim() || "sin unidad";
  return {
    cantidad: cantidad.toString(),
    unidad: "",
    problema: `El documento dice "${comoViene}" y ${producto.name} se mide en ${UNIT_LABELS[baseUnit]}. Elige la unidad, o configurale la presentacion al producto para poder capturarlo por bulto.`,
  };
}

/**
 * Aplica una asociacion ya confirmada antes.
 *
 * Si aquella vez se capturo por bulto y el producto sigue teniendo ese bulto, se vuelve a
 * ofrecer por bulto, que es como lo lee la persona. Si al producto le quitaron esa
 * presentacion desde entonces, se cae al factor guardado, que es el numero con el que de
 * verdad se calculo aquella vez.
 */
function aplicarAsociacion(
  asociacion: AsociacionGuardada,
  cantidadTexto: string,
  producto: OpcionProducto,
): { cantidad: string; unidad: UnidadCaptura; problema: string | null } {
  let cantidad: Decimal;
  try {
    cantidad = new Decimal(cantidadTexto || "0");
  } catch {
    cantidad = new Decimal(0);
  }
  if (!cantidad.isFinite() || cantidad.lte(0)) {
    return { cantidad: "", unidad: "", problema: "No se leyo la cantidad: capturala." };
  }

  if (asociacion.presentationLabel) {
    const etiqueta = normalizar(asociacion.presentationLabel);
    const bulto = producto.bultos.find((b) => normalizar(b.label) === etiqueta);
    if (bulto) {
      return { cantidad: cantidad.toString(), unidad: `PRES:${bulto.id}`, problema: null };
    }
  }

  const convertida = cantidad.times(asociacion.factor);
  return { cantidad: convertida.toString(), unidad: asociacion.presentationUnit, problema: null };
}

/** La llave con la que se busca y se guarda una asociacion. */
export function claveDeAsociacion(descripcion: string): string {
  return normalizar(descripcion);
}

function buscarAsociacion(
  descripcion: string,
  unidadDocumento: string,
  supplierId: string | null,
  asociaciones: AsociacionGuardada[],
): AsociacionGuardada | null {
  const clave = claveDeAsociacion(descripcion);
  const unidad = unidadDocumento.trim().toUpperCase();
  const coincide = (a: AsociacionGuardada) =>
    a.claveDescripcion === clave && a.unidadDocumento.trim().toUpperCase() === unidad;

  // La del proveedor exacto manda sobre la general: el mismo texto puede querer decir cosas
  // distintas en la factura de dos proveedores.
  const delProveedor = supplierId
    ? (asociaciones.find((a) => a.supplierId === supplierId && coincide(a)) ?? null)
    : null;
  if (delProveedor) return delProveedor;
  return asociaciones.find((a) => a.supplierId === null && coincide(a)) ?? null;
}

export function resolverBorrador(
  borrador: BorradorCompra,
  productos: OpcionProducto[],
  proveedores: (OpcionProveedor & { rfc: string | null })[],
  asociaciones: AsociacionGuardada[] = [],
): CompraResuelta {
  const proveedor = buscarProveedor(borrador.proveedor.nombre, borrador.proveedor.rfc, proveedores);
  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  const lineas: LineaResuelta[] = borrador.lineas.map((linea) => {
    const sinResolver = (problema: string): LineaResuelta => ({
      ...linea,
      productId: null,
      productoNombre: null,
      coincidencia: "ninguna" as const,
      cantidadCaptura: linea.cantidad,
      unidadCaptura: "" as const,
      problema,
    });

    // Primero lo que alguien ya confirmo; el parecido del nombre es el respaldo.
    const guardada = buscarAsociacion(
      linea.descripcion,
      linea.unidadDocumento,
      proveedor?.id ?? null,
      asociaciones,
    );
    if (guardada) {
      const producto = productoPorId.get(guardada.productId);
      if (producto) {
        const traducido = aplicarAsociacion(guardada, linea.cantidad, producto);
        return {
          ...linea,
          productId: producto.id,
          productoNombre: producto.name,
          coincidencia: "guardada" as const,
          cantidadCaptura: traducido.cantidad,
          unidadCaptura: traducido.unidad,
          problema: traducido.problema ?? problemaDeImporte(linea.importe),
        };
      }
      // La asociacion apunta a un producto archivado o borrado: se ignora en vez de fallar.
    }

    const encontrado = buscarProducto(linea.descripcion, productos);
    if (!encontrado) return sinResolver("Elige a que producto del catalogo corresponde.");

    const { producto, coincidencia } = encontrado;
    const traducido = traducirCantidad(
      linea.cantidad,
      linea.unidadDocumento,
      linea.descripcion,
      producto,
    );

    return {
      ...linea,
      productId: producto.id,
      productoNombre: producto.name,
      coincidencia,
      cantidadCaptura: traducido.cantidad,
      unidadCaptura: traducido.unidad,
      problema: traducido.problema ?? problemaDeImporte(linea.importe),
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

function problemaDeImporte(importe: string): string | null {
  try {
    return new Decimal(importe || "0").lte(0) ? "No se leyo el importe: capturalo." : null;
  } catch {
    return "El importe no es un numero: capturalo.";
  }
}
