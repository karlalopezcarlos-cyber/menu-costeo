import Decimal from "decimal.js";
import { sumTaxes, type TaxRates } from "@/lib/taxes";

/**
 * El cuadre contra el papel.
 *
 * La regla de la casa: lo que se guarda tiene que dar el mismo total que la nota. Un registro
 * que no da el total del papel no sirve para cuadrar con el proveedor, ni para pagarle, ni
 * para la contabilidad, y el error no se descubre el dia que se captura sino meses despues,
 * cuando ya nadie se acuerda de que factura era.
 *
 * Por eso no es un aviso: no deja guardar. La pantalla lo revisa para que la persona lo vea
 * mientras corrige, y el servidor lo vuelve a revisar porque una pestana que lleva horas
 * abierta, o un envio armado a mano, no pueden meter una compra descuadrada.
 */

/** Un centavo arriba o abajo es redondeo del proveedor, no un error de captura. */
export const TOLERANCIA_CUADRE = 0.05;

export type RenglonParaCuadrar = { subtotal: Decimal.Value; rates: TaxRates };

/**
 * Null cuando cuadra (o cuando no hay contra que cuadrar); el texto del problema cuando no.
 *
 * `totalDelDocumento` llega como texto porque viene de un formulario. Vacio quiere decir que
 * no hay documento con que comparar -- la captura a mano de siempre -- y ahi no hay nada que
 * exigir: la regla es contra el papel, y sin papel no hay regla.
 */
export function problemaDeCuadre(
  renglones: RenglonParaCuadrar[],
  totalDelDocumento: string,
  /** Lo retenido en el documento, que el total del papel ya trae descontado. */
  retenciones: string = "",
): string | null {
  const texto = totalDelDocumento.trim();
  if (!texto) return null;

  let total: Decimal;
  try {
    total = new Decimal(texto);
  } catch {
    return "El total del documento no es un numero.";
  }
  if (!total.isFinite() || total.lte(0)) {
    return "Captura el total que dice el documento: es contra ese numero que se cuadra la compra.";
  }

  const calculado = new Decimal(sumTaxes(renglones).total).minus(decimalSeguro(retenciones));
  const diferencia = calculado.minus(total);
  if (diferencia.abs().lte(TOLERANCIA_CUADRE)) return null;

  return `Lo capturado suma $${calculado.toFixed(2)} con impuestos y el documento dice $${total.toFixed(
    2,
  )}: hay una diferencia de $${diferencia.abs().toFixed(2)}. La compra tiene que quedar igual que el papel.`;
}

function decimalSeguro(texto: string): Decimal {
  if (!texto.trim()) return new Decimal(0);
  try {
    const n = new Decimal(texto);
    return n.isFinite() && n.gt(0) ? n : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
