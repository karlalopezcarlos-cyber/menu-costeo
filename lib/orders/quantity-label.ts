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

/**
 * Sugiere una presentacion + cantidad de piezas para cubrir una cantidad neta (en la unidad base
 * del producto), para prellenar PresentationQuantityInput ya convertido en vez de dejarlo en
 * "cantidad libre". Prefiere la presentacion mas grande que quepa al menos una vez completa dentro
 * de lo necesario (para no sugerir, ej., un costal de 25kg cuando solo faltan 2kg si hay una
 * presentacion mas chica disponible); si ninguna cabe completa, usa la mas chica (siempre se
 * necesita minimo 1 pieza). Las piezas siempre se redondean hacia arriba (no se puede comprar media
 * pieza) para que la sugerencia nunca quede por debajo de lo que hace falta. Regresa null si el
 * producto no tiene ninguna presentacion definida (el llamador cae a la cantidad en unidad base).
 */
export function suggestPresentationLabel(netBaseQty: Decimal.Value, product: ProductLike): string | null {
  const baseUnit = product.baseUnit as UnitValue;
  const netQty = new Decimal(netBaseQty);
  if (netQty.lte(0)) return null;

  const allPresentations: PresentationLike[] = [
    ...(product.presentationUnitLabel && product.presentationUnitQty
      ? [{ label: product.presentationUnitLabel, quantity: product.presentationUnitQty, unit: baseUnit }]
      : []),
    ...product.presentations,
  ];
  if (allPresentations.length === 0) return null;

  const sized = allPresentations
    .map((p) => {
      try {
        return { presentation: p, sizeInBase: convertQty(p.quantity, p.unit as UnitValue, baseUnit) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { presentation: PresentationLike; sizeInBase: Decimal } => !!entry && entry.sizeInBase.gt(0))
    .sort((a, b) => b.sizeInBase.comparedTo(a.sizeInBase));
  if (sized.length === 0) return null;

  const bestFit = sized.find((entry) => entry.sizeInBase.lte(netQty)) ?? sized[sized.length - 1];
  const pieceCount = netQty.dividedBy(bestFit.sizeInBase).ceil();
  return `${pieceCount.toNumber()} ${bestFit.presentation.label}`;
}
