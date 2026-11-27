import type { UnitValue } from "@/lib/units";

/**
 * Tipos compartidos por las dos formas de subir una compra sin teclearla: el XML de la factura
 * y la foto de la nota.
 *
 * Las dos desembocan en la misma estructura a proposito. El XML es exacto y la foto es una
 * lectura con IA que puede equivocarse, pero la pantalla de revision es la misma y nada se
 * guarda sin que una persona lo confirme: asi la diferencia entre las dos vias es de que tan
 * seguro llega el dato, no de que tanto hay que revisarlo.
 *
 * Este archivo no importa Prisma: lo lee tambien el componente de cliente.
 */

export type OrigenBorrador = "xml" | "foto";

/** Un renglon tal como venia en el documento, antes de cruzarlo con el catalogo. */
export type LineaDocumento = {
  /** Llave estable para React, no se guarda. */
  id: string;
  descripcion: string;
  /** Cantidad como viene en el papel (2, 1.5, 12). */
  cantidad: string;
  /** La unidad como viene escrita: "PZA", "KG", "H87", "Caja". Texto libre a proposito. */
  unidadDocumento: string;
  /** Sin impuesto. El importe manda; el unitario es informativo. */
  precioUnitario: string | null;
  importe: string;
  /** Tasa de la factura en porcentaje ("16"), no la del catalogo. Null si el documento no la trae. */
  ivaRate: string | null;
  iepsRate: string | null;
  claveProdServ: string | null;
};

export type BorradorCompra = {
  origen: OrigenBorrador;
  /** YYYY-MM-DD. */
  fecha: string | null;
  folio: string | null;
  proveedor: { nombre: string | null; rfc: string | null };
  /** Sin impuesto. Sirve para cuadrar contra la suma de los renglones. */
  subtotal: string | null;
  total: string | null;
  lineas: LineaDocumento[];
  /** Lo que el lector no pudo resolver y la persona tiene que mirar. */
  avisos: string[];
};

/**
 * De donde salio el emparejado.
 *
 * "guardada" es una asociacion que alguien ya confirmo antes para ese proveedor y esa
 * descripcion; las otras dos son el parecido del nombre, que es una corazonada.
 */
export type Coincidencia = "guardada" | "exacta" | "parecida" | "ninguna";

/**
 * La unidad con la que se captura la cantidad.
 *
 * `PRES:<id>` quiere decir uno de los bultos del producto (botella, caja, galon): la cantidad
 * se cuenta en bultos y la app la multiplica por lo que trae cada uno. Es una opcion de
 * captura, no una unidad de medida: al guardar siempre se convierte a una unidad real.
 */
export type UnidadCaptura = UnitValue | `PRES:${string}` | "";

/** El mismo renglon, ya cruzado contra el catalogo y traducido a lo que Compras necesita. */
export type LineaResuelta = LineaDocumento & {
  productId: string | null;
  productoNombre: string | null;
  coincidencia: Coincidencia;
  /** Lo que va en la casilla de cantidad. Que significa depende de unidadCaptura. */
  cantidadCaptura: string;
  unidadCaptura: UnidadCaptura;
  /** Lo que impide guardar este renglon tal como esta, en espanol y para la persona. */
  problema: string | null;
};

export type CompraResuelta = {
  origen: OrigenBorrador;
  fecha: string | null;
  folio: string | null;
  subtotal: string | null;
  total: string | null;
  proveedor: {
    nombre: string | null;
    rfc: string | null;
    supplierId: string | null;
    /** El documento trae proveedor pero no hay ninguno en el catalogo que le corresponda. */
    sinCatalogo: boolean;
  };
  lineas: LineaResuelta[];
  avisos: string[];
};

/**
 * Una forma de comprar un producto por bulto: "Botella" de 700 ML, "Caja" de 24 PZA.
 *
 * La primera (id "legacy") es la presentacion fija del producto; las demas son las
 * presentaciones con nombre que se le hayan configurado. La pantalla de revision las ofrece
 * en la lista de unidades para poder capturar "3 botellas" en vez de "2.1 LT".
 */
export type OpcionBulto = {
  id: string;
  label: string;
  /** Cuanto trae un bulto, en `unit`. */
  quantity: string;
  unit: UnitValue;
};

/** Catalogo que la pantalla de revision necesita para poder corregir a mano. */
export type OpcionProducto = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  presentationUnitLabel: string | null;
  presentationUnitQty: string | null;
  bultos: OpcionBulto[];
};

export type OpcionProveedor = { id: string; name: string };

/** Una asociacion ya guardada, como la necesita el emparejado. */
export type AsociacionGuardada = {
  id: string;
  supplierId: string | null;
  claveDescripcion: string;
  unidadDocumento: string;
  productId: string;
  /** Por cuanto se multiplica la cantidad del documento para llegar a presentationUnit. */
  factor: string;
  presentationUnit: UnitValue;
  /** Con valor cuando se capturo por bulto: asi se vuelve a ofrecer en bultos. */
  presentationLabel: string | null;
};
