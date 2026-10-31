/**
 * Tipos y etiquetas del kardex, sin nada de base de datos.
 *
 * Viven aparte porque la tabla es un componente de cliente: si importara el modulo que consulta
 * la base, Prisma terminaria empaquetado para el navegador.
 */

export type KardexType =
  | "compra"
  | "requisicion_entrada"
  | "transformacion_entrada"
  | "transformacion_salida"
  | "produccion_salida"
  | "venta"
  | "merma"
  | "servicio"
  | "pruebas"
  | "requisicion_salida";

export const KARDEX_TYPE_LABELS: Record<KardexType, string> = {
  compra: "Compra",
  requisicion_entrada: "Requisicion (entrada)",
  transformacion_entrada: "Transformacion (entrada)",
  transformacion_salida: "Transformacion (consumo)",
  produccion_salida: "Produccion (consumo)",
  venta: "Venta",
  merma: "Merma",
  servicio: "Salida a servicio",
  pruebas: "Pruebas",
  requisicion_salida: "Requisicion (salida)",
};

export type KardexRow = {
  id: string;
  /** Dia del movimiento (el capturado, no el de captura). */
  dateValue: number;
  dateLabel: string;
  /** Cuando se capturo, en la hora del negocio. Vacio en los movimientos sin sello de tiempo. */
  timeLabel: string;
  createdAtValue: number;
  productId: string;
  productName: string;
  unitLabel: string;
  type: KardexType;
  typeLabel: string;
  /** Folio del documento que lo origino (COM-0079, POR-0036, REQ-0004...). */
  reference: string;
  /** El detalle de ese movimiento: proveedor, sucursal, platillo, comentario. */
  detail: string;
  qtyDelta: number;
  userName: string | null;
  href: string | null;
};

export type KardexFilters = {
  productId: string;
  search: string;
  folio: string;
  /** Nombre del usuario tal como se muestra; el filtro es exacto. */
  user: string;
  type: string;
  dateFrom: string;
  dateTo: string;
};

export type KardexTotals = {
  entradas: number;
  salidas: number;
  porTipo: { type: KardexType; label: string; qty: number }[];
};
