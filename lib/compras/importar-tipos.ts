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

export type Coincidencia = "exacta" | "parecida" | "ninguna";

/** El mismo renglon, ya cruzado contra el catalogo y traducido a lo que Compras necesita. */
export type LineaResuelta = LineaDocumento & {
  productId: string | null;
  productoNombre: string | null;
  coincidencia: Coincidencia;
  /** Cantidad en una unidad compatible con la unidad base del producto. */
  presentationQty: string;
  presentationUnit: UnitValue | "";
  presentationLabel: string;
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

/** Catalogo que la pantalla de revision necesita para poder corregir a mano. */
export type OpcionProducto = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  presentationUnitLabel: string | null;
  presentationUnitQty: string | null;
};

export type OpcionProveedor = { id: string; name: string };
