import Decimal from "decimal.js";
import { convertQty, type UnitValue } from "@/lib/units";

/**
 * Calculo de un porcionamiento.
 *
 * El problema que resuelve: una receta dice que una porcion de camaron lleva 20 g, pero para
 * tener esos 20 g limpios hay que partir de mas producto crudo. La diferencia —cabeza, cascara,
 * recorte— es merma real que nadie mide. Aqui se mide: entra un peso, salen porciones, y lo que
 * falta es la merma de ese corte.
 */

export type PortioningOutputInput = {
  recipeId: string;
  recipeName: string;
  portions: number;
  /** Rendimiento de la receta de porcion: cuanto pesa UNA porcion. */
  portionQty: Decimal.Value;
  portionUnit: UnitValue;
};

export type PortioningOutputResult = {
  recipeId: string;
  recipeName: string;
  portions: number;
  /** Peso de una porcion, convertido a la unidad base del producto. */
  portionQtyInBase: Decimal;
  /** Peso total que se llevo este tipo de porcion. */
  totalQtyInBase: Decimal;
  /** Costo real de cada porcion, ya con la merma repartida. */
  realUnitCost: Decimal;
  /** Costo teorico segun la receta, sin merma. Sirve para ver la diferencia. */
  theoreticalUnitCost: Decimal;
};

export type PortioningResult = {
  initialQty: Decimal;
  /** Suma de lo que salio en porciones, en la unidad base. */
  portionedQty: Decimal;
  /** Lo que se perdio: entrada menos salida. */
  mermaQty: Decimal;
  /** Porcentaje de lo que entro que se aprovecho. 1 kg -> 600 g de porciones = 60%. */
  realYieldPct: Decimal;
  mermaPct: Decimal;
  /** Costo de todo el producto que entro. */
  totalCost: Decimal;
  totalPortions: number;
  outputs: PortioningOutputResult[];
};

export class PortioningError extends Error {}

/**
 * @param initialQty  Cantidad con la que se empezo, en la unidad base del producto.
 * @param baseUnit    Unidad base del producto porcionado.
 * @param unitCost    Costo por unidad base del producto (el costo vigente del catalogo).
 * @param outputs     Tipos de porcion que salieron, con su cantidad.
 */
export function computePortioning(
  initialQty: Decimal.Value,
  baseUnit: UnitValue,
  unitCost: Decimal.Value,
  outputs: PortioningOutputInput[],
): PortioningResult {
  const initial = new Decimal(initialQty);
  if (initial.lte(0)) {
    throw new PortioningError("El peso inicial debe ser mayor a cero.");
  }
  if (outputs.length === 0) {
    throw new PortioningError("Captura al menos un tipo de porcion que haya salido.");
  }

  const cost = new Decimal(unitCost);
  const totalCost = initial.times(cost);

  const parciales = outputs.map((output) => {
    if (!Number.isInteger(output.portions) || output.portions <= 0) {
      throw new PortioningError(`Las porciones de "${output.recipeName}" deben ser un numero entero mayor a cero.`);
    }
    const portionQty = new Decimal(output.portionQty);
    if (portionQty.lte(0)) {
      throw new PortioningError(
        `La receta "${output.recipeName}" no tiene un rendimiento valido: revisa cuanto pesa una porcion.`,
      );
    }
    // La receta puede estar en gramos y el producto en kilos: se convierte a la unidad base.
    const portionQtyInBase = convertQty(portionQty, output.portionUnit, baseUnit);
    return {
      ...output,
      portionQtyInBase,
      totalQtyInBase: portionQtyInBase.times(output.portions),
    };
  });

  const portionedQty = parciales.reduce((sum, p) => sum.plus(p.totalQtyInBase), new Decimal(0));

  if (portionedQty.gt(initial)) {
    throw new PortioningError(
      `Las porciones suman ${portionedQty.toFixed(3)} y solo entraron ${initial.toFixed(3)}: ` +
        "de un producto no puede salir mas de lo que entro. Revisa el peso inicial o el numero de porciones.",
    );
  }

  const mermaQty = initial.minus(portionedQty);
  const realYieldPct = portionedQty.dividedBy(initial).times(100);

  const resultados: PortioningOutputResult[] = parciales.map((p) => ({
    recipeId: p.recipeId,
    recipeName: p.recipeName,
    portions: p.portions,
    portionQtyInBase: p.portionQtyInBase,
    totalQtyInBase: p.totalQtyInBase,
    // La merma se reparte entre los tipos de porcion en proporcion al peso que se llevaron:
    // una porcion de 30 g carga mas merma que una de 20 g, porque consumio mas producto.
    realUnitCost: portionedQty.isZero()
      ? new Decimal(0)
      : totalCost.times(p.totalQtyInBase).dividedBy(portionedQty).dividedBy(p.portions),
    theoreticalUnitCost: p.portionQtyInBase.times(cost),
  }));

  return {
    initialQty: initial,
    portionedQty,
    mermaQty,
    realYieldPct,
    mermaPct: new Decimal(100).minus(realYieldPct),
    totalCost,
    totalPortions: parciales.reduce((sum, p) => sum + p.portions, 0),
    outputs: resultados,
  };
}

/**
 * Rendimiento que se le va a guardar al producto, promediando sus porcionamientos recientes.
 *
 * Se promedia en vez de tomar el ultimo porque un solo corte malo —o un pesaje descuidado— no
 * debe mover el costeo de todas las recetas que usan ese producto.
 */
export function averageYield(recentYields: Decimal.Value[]): Decimal | null {
  if (recentYields.length === 0) return null;
  const suma = recentYields.reduce((acc: Decimal, y) => acc.plus(new Decimal(y)), new Decimal(0));
  const promedio = suma.dividedBy(recentYields.length);
  // El rendimiento del producto vive entre 0 y 100 exclusivo/inclusivo.
  if (promedio.lte(0)) return null;
  return Decimal.min(promedio, 100);
}
