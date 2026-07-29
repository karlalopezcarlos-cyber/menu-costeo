import Decimal from "decimal.js";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";

type PresentationLike = { label: string; quantity: Decimal.Value; unit: string };
type ProductLike = {
  baseUnit: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: Decimal.Value | null;
  presentations: PresentationLike[];
};

/**
 * Para mostrar en el PDF de un pedido: si la presentacion del renglon coincide con una
 * presentacion definida del producto (nueva tabla o el campo unico legado de botellas), muestra
 * el numero de piezas (ej. "1") en vez de la cantidad ya convertida a la unidad base (ej. "25 KG").
 * Si no coincide con ninguna, muestra la cantidad en la unidad base como respaldo.
 *
 * El input de captura con multiples presentaciones (hasta 3 por renglon) ya arma el texto final
 * con las piezas de cada una (ej. "2 COSTAL 25 KG + 1 BOLSA 1 KG"), asi que ese texto siempre
 * empieza con un numero: si lo detectamos, lo mostramos tal cual sin volver a intentar matchear
 * una sola presentacion.
 */
export function formatOrderItemQuantityLabel(
  quantity: Decimal.Value,
  presentationLabel: string,
  product: ProductLike,
): string {
  if (/^\d/.test(presentationLabel.trim())) return presentationLabel;

  const baseUnit = product.baseUnit as UnitValue;
  const baseQty = new Decimal(quantity);
  const allPresentations: PresentationLike[] = [
    ...(product.presentationUnitLabel && product.presentationUnitQty
      ? [{ label: product.presentationUnitLabel, quantity: product.presentationUnitQty, unit: baseUnit }]
      : []),
    ...product.presentations,
  ];
  const matched = allPresentations.find((p) => p.label === presentationLabel);

  if (matched) {
    try {
      const qtyInPresentationUnit = convertQty(baseQty, baseUnit, matched.unit as UnitValue);
      const pieceCount = qtyInPresentationUnit.dividedBy(matched.quantity);
      return pieceCount.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 });
    } catch {
      // Unidad incompatible o dato invalido: cae al respaldo de abajo.
    }
  }
  return `${baseQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[baseUnit]}`;
}
