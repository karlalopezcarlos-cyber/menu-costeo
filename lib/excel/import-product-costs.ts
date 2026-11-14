import { parseNameCostWorkbook, type NameCostParseResult } from "./import-name-cost";

export type ProductCostParseResult = NameCostParseResult;

/**
 * Costos por producto para una sucursal.
 *
 * "Nombre" entra en la lista de encabezados a proposito: la plantilla de carga masiva de
 * productos encabeza su primera columna "Nombre *", y es justo el archivo que se tiene a la
 * mano cuando se abre una sucursal. "Insumo", "articulo" y "descripcion" estan por los archivos
 * que salen del punto de venta del restaurante.
 *
 * El orden de los costos preferidos no es casual. El de nuestra plantilla primero. Despues
 * ULTIMOCOSTO, que es lo que exporta Soft Restaurant y convive siempre con COSTOPROMEDIO: el
 * ultimo es con el que se va a comprar manana, el promedio es historia. Quien quiera el
 * promedio lo escribe en el campo de la pantalla.
 */
export async function parseProductCostsWorkbook(
  buffer: Buffer,
  costHeader?: string,
): Promise<ProductCostParseResult> {
  return parseNameCostWorkbook(buffer, {
    nameHeaders: ["producto", "insumo", "articulo", "descripcion", "nombre"],
    preferredCostHeaders: ["costo en esta sucursal", "ultimocosto", "ultimo costo"],
    noun: "producto",
    costHeader,
  });
}
