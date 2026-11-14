import {
  parseNameCostWorkbook,
  type NameCostParseResult,
  type ParsedNameCostRow,
  type RowError,
} from "./import-name-cost";

export type { RowError };

export type ParsedRecipeCostRow = ParsedNameCostRow;
export type ParseResult = NameCostParseResult;

/**
 * Costos por platillo. La mecanica -encontrar los encabezados, tolerar "$1,250.50", callar las
 * celdas vacias, tomar una vez el platillo repetido con el mismo costo- vive en
 * parseNameCostWorkbook, compartida con la carga de costos por producto.
 */
export async function parseRecipeCostsWorkbook(buffer: Buffer): Promise<ParseResult> {
  return parseNameCostWorkbook(buffer, {
    nameHeaders: ["platillo", "receta", "producto", "descripcion", "nombre"],
    preferredCostHeaders: ["costo capturado", "ultimocosto", "ultimo costo"],
    noun: "platillo",
  });
}
