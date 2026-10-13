import Decimal from "decimal.js";

/**
 * Calculo de un porcionamiento.
 *
 * El problema que resuelve: una receta de porcion dice que lleva 80 g de camaron limpio, pero
 * para tener esos 80 g hay que partir de mas producto crudo. La diferencia —cabeza, cascara,
 * recorte— es merma real que nadie mide. Aqui se mide: entra un peso, salen porciones, y lo que
 * falta es la merma de ese corte.
 *
 * Importante: cuanto pesa una porcion NO sale del rendimiento de la receta (que suele ser
 * "1 PZA"), sino de cuanto del producto base lleva la receta entre sus ingredientes. Por eso
 * quien llama pasa `baseQtyPerPortion` ya resuelto con getRecipeUsagePerUnit, en la unidad base
 * del producto: asi una receta que rinde piezas puede porcionar un producto que se mide en kilos.
 */

export type PortioningOutputInput = {
  recipeId: string;
  recipeName: string;
  portions: number;
  /** Cuanto del producto base consume UNA porcion, en la unidad base del producto. */
  baseQtyPerPortion: Decimal.Value;
  /** Costo de los demas ingredientes de esa porcion (otro producto simple, una subreceta). */
  extraCostPerPortion?: Decimal.Value;
};

export type PortioningOutputResult = {
  recipeId: string;
  recipeName: string;
  portions: number;
  baseQtyPerPortion: Decimal;
  /** Producto base que se llevo este tipo de porcion en total. */
  totalQtyInBase: Decimal;
  /** Parte del costo del producto base que carga cada porcion, ya con la merma repartida. */
  baseCostPerPortion: Decimal;
  extraCostPerPortion: Decimal;
  /** Lo que de verdad cuesta una pieza: producto base con merma + los demas ingredientes. */
  realUnitCost: Decimal;
  /** Lo que diria la receta si no hubiera merma. Sirve para ver el tamano del hueco. */
  theoreticalUnitCost: Decimal;
};

export type PortioningResult = {
  initialQty: Decimal;
  /** Suma de producto base que se fue en porciones. */
  portionedQty: Decimal;
  /** Lo que se perdio: entrada menos salida. */
  mermaQty: Decimal;
  /** Porcentaje de lo que entro que se aprovecho. 1 kg -> 800 g en porciones = 80%. */
  realYieldPct: Decimal;
  mermaPct: Decimal;
  /** Costo de todo el producto base que entro. */
  totalCost: Decimal;
  totalPortions: number;
  outputs: PortioningOutputResult[];
};

export class PortioningError extends Error {}

/**
 * @param initialQty      Cantidad con la que se empezo, en la unidad base del producto.
 * @param grossUnitCost   Costo por unidad COMPRADA (sin aplicar rendimiento). Es lo que costo
 *                        de verdad el producto crudo que entro.
 * @param usableUnitCost  Costo por unidad APROVECHABLE (el del catalogo, que ya trae aplicado
 *                        el rendimiento). Solo se usa para el comparativo teorico.
 * @param outputs         Tipos de porcion que salieron, con su consumo de producto base.
 */
export function computePortioning(
  initialQty: Decimal.Value,
  grossUnitCost: Decimal.Value,
  usableUnitCost: Decimal.Value,
  outputs: PortioningOutputInput[],
): PortioningResult {
  const initial = new Decimal(initialQty);
  if (initial.lte(0)) {
    throw new PortioningError("El peso inicial debe ser mayor a cero.");
  }
  if (outputs.length === 0) {
    throw new PortioningError("Captura al menos un tipo de porcion que haya salido.");
  }

  const bruto = new Decimal(grossUnitCost);
  const aprovechable = new Decimal(usableUnitCost);
  const totalCost = initial.times(bruto);

  const parciales = outputs.map((output) => {
    if (!Number.isInteger(output.portions) || output.portions <= 0) {
      throw new PortioningError(
        `Las porciones de "${output.recipeName}" deben ser un numero entero mayor a cero.`,
      );
    }
    const baseQtyPerPortion = new Decimal(output.baseQtyPerPortion);
    if (baseQtyPerPortion.lte(0)) {
      throw new PortioningError(
        `La receta "${output.recipeName}" no lleva este producto entre sus ingredientes, ` +
          "asi que no se puede saber cuanto consume cada porcion.",
      );
    }
    return {
      ...output,
      baseQtyPerPortion,
      extraCost: new Decimal(output.extraCostPerPortion ?? 0),
      totalQtyInBase: baseQtyPerPortion.times(output.portions),
    };
  });

  const portionedQty = parciales.reduce((sum, p) => sum.plus(p.totalQtyInBase), new Decimal(0));

  if (portionedQty.gt(initial)) {
    throw new PortioningError(
      `Las porciones necesitan ${portionedQty.toFixed(3)} y solo entraron ${initial.toFixed(3)}: ` +
        "de un producto no puede salir mas de lo que entro. Revisa el peso inicial o el numero de porciones.",
    );
  }

  const mermaQty = initial.minus(portionedQty);
  const realYieldPct = portionedQty.dividedBy(initial).times(100);

  const resultados: PortioningOutputResult[] = parciales.map((p) => {
    // La merma se reparte entre los tipos de porcion en proporcion al producto base que se
    // llevaron: una porcion de 100 g carga mas merma que una de 80 g.
    const baseCostPerPortion = portionedQty.isZero()
      ? new Decimal(0)
      : totalCost.times(p.totalQtyInBase).dividedBy(portionedQty).dividedBy(p.portions);

    return {
      recipeId: p.recipeId,
      recipeName: p.recipeName,
      portions: p.portions,
      baseQtyPerPortion: p.baseQtyPerPortion,
      totalQtyInBase: p.totalQtyInBase,
      baseCostPerPortion,
      extraCostPerPortion: p.extraCost,
      realUnitCost: baseCostPerPortion.plus(p.extraCost),
      // Lo que hoy dice la receta que cuesta esta porcion, con el rendimiento capturado en el
      // catalogo. Cuando ese rendimiento es el correcto, este numero y el real coinciden.
      theoreticalUnitCost: p.baseQtyPerPortion.times(aprovechable).plus(p.extraCost),
    };
  });

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
  if (promedio.lte(0)) return null;
  return Decimal.min(promedio, 100);
}
