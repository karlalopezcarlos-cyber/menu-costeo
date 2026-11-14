import { parseNameCostWorkbook, type NameCostParseResult } from "./import-name-cost";

export type CountParseResult = NameCostParseResult;

/**
 * Cantidades contadas de un conteo de inventario.
 *
 * Es el mismo problema que los costos -un nombre y un numero, en el archivo que el restaurante
 * ya tiene- asi que comparte el lector. Lo que cambia es que aqui la columna buena es la del
 * conteo fisico y no la de lo que el sistema creia que habia.
 *
 * Ese orden importa mucho. Un export de punto de venta trae las dos juntas: "fisico" es lo que
 * alguien fue a contar con una tabla en la mano, "existencia" es lo que el sistema suponia. Si
 * se cargara la segunda, el conteo diria exactamente lo que el sistema ya creia y la auditoria
 * saldria en ceros: el reporte se veria perfecto justo por estar mal.
 *
 * Se aceptan negativos, aunque un conteo fisico negativo no exista: salen de los sistemas de
 * punto de venta cuando se vendio mas de lo que habia capturado. Quien llama decide si los
 * guarda o los reporta.
 */
export async function parseCountWorkbook(
  buffer: Buffer,
  valueHeader?: string,
): Promise<CountParseResult> {
  return parseNameCostWorkbook(buffer, {
    nameHeaders: ["producto", "insumo", "articulo", "descripcion", "nombre"],
    valueKeywords: ["cantidad", "fisico", "contad", "existencia"],
    preferredValueHeaders: [
      "cantidad contada",
      "cantidad",
      "fisico",
      "fisicoalmacen1",
      "conteo fisico",
    ],
    noun: "producto",
    valueNoun: "cantidad",
    valueHeader,
    allowNegative: true,
  });
}
