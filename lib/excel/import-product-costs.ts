import { parseNameCostWorkbook, type NameCostParseResult } from "./import-name-cost";

export type ProductCostParseResult = NameCostParseResult;

/**
 * Costos por producto para una sucursal.
 *
 * "Nombre" entra en la lista a proposito: la plantilla de carga masiva de productos encabeza su
 * primera columna "Nombre *", y es justo el archivo que se tiene a la mano cuando se abre una
 * sucursal. "Insumo" y "articulo" estan por los archivos que vienen de un proveedor.
 */
export async function parseProductCostsWorkbook(buffer: Buffer): Promise<ProductCostParseResult> {
  return parseNameCostWorkbook(buffer, {
    nameHeaders: ["producto", "insumo", "articulo", "descripcion", "nombre"],
    preferredCostHeader: "costo en esta sucursal",
    noun: "producto",
  });
}
