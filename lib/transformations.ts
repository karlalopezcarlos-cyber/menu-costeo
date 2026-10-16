import Decimal from "decimal.js";
import { convertQty, type UnitValue } from "@/lib/units";

/**
 * Calculo de una transformacion: entra un producto, salen otros.
 *
 * Es el mismo calculo para limpiar y para porcionar, porque son la misma operacion: de un kilo
 * de camaron crudo pueden salir 800 g de camaron limpio, o 20 porciones de 40 g, o las dos
 * cosas. Lo unico que cambia es en que se cuenta la salida.
 *
 * La regla es una sola: **el dinero que entro es el que sale**. El costo de lo que entro se
 * reparte entre lo que de verdad salio. Si de 200 g salieron 9 porciones en vez de 10, esas 9
 * cargan los 200 g y cuestan mas; si salieron 11 porque el producto venia de dos cajas, cuestan
 * menos. Por eso aqui NO hay un tope: no existe un "deberian salir X". El peso por porcion solo
 * sirve para repartir el costo cuando salen varios tamanos de la misma tanda.
 *
 * Lo que entra se valua al costo BRUTO del origen (sin su factor de rendimiento): la merma de
 * esta transformacion se esta midiendo aqui, y aplicar las dos cosas la contaria dos veces.
 */

export type TransformationOutputInput = {
  productId: string;
  productName: string;
  /** Cuanto salio, en la unidad base del producto de salida (20 piezas, 0.8 kg...). */
  qty: Decimal.Value;
  /**
   * Cuanto del producto de ORIGEN representa UNA unidad de salida, ya convertido a la unidad
   * del origen. Una porcion de 20 g saliendo de un producto que se mide en kilos: 0.02.
   */
  refQtyPerUnit: Decimal.Value;
  /** Costo de los agregados de cada unidad (sal, limon, bolsa). */
  extraCostPerUnit?: Decimal.Value;
};

export type TransformationOutputResult = {
  productId: string;
  productName: string;
  qty: Decimal;
  refQtyPerUnit: Decimal;
  /** Cuanto producto de origen representa toda esta salida. */
  equivalentQty: Decimal;
  /** Parte del costo de lo que entro que carga cada unidad de salida. */
  baseCostPerUnit: Decimal;
  extraCostPerUnit: Decimal;
  /** Lo que de verdad cuesta cada pieza o cada kilo que salio. */
  unitCost: Decimal;
  /** Lo que costaria si no se hubiera perdido nada. Sirve para ver el tamano del hueco. */
  theoreticalUnitCost: Decimal;
};

export type TransformationResult = {
  initialQty: Decimal;
  /** Suma del producto de origen que representan todas las salidas. */
  outputQtyInSource: Decimal;
  /** Lo que no llego a ninguna salida. Negativo = salio mas de lo que se capturo que entro. */
  mermaQty: Decimal;
  realYieldPct: Decimal;
  mermaPct: Decimal;
  totalCost: Decimal;
  /** true cuando las salidas pesan mas que la entrada: no se bloquea, se avisa. */
  excedeEntrada: boolean;
  outputs: TransformationOutputResult[];
};

export class TransformationError extends Error {}

export function computeTransformation(
  initialQty: Decimal.Value,
  grossUnitCost: Decimal.Value,
  outputs: TransformationOutputInput[],
): TransformationResult {
  const initial = new Decimal(initialQty);
  if (initial.lte(0)) {
    throw new TransformationError("Lo que entro debe ser mayor a cero.");
  }
  if (outputs.length === 0) {
    throw new TransformationError("Captura al menos un producto que haya salido.");
  }

  const bruto = new Decimal(grossUnitCost);
  const totalCost = initial.times(bruto);

  const parciales = outputs.map((output) => {
    const qty = new Decimal(output.qty);
    if (qty.lte(0)) {
      throw new TransformationError(`Lo que salio de "${output.productName}" debe ser mayor a cero.`);
    }
    const refQtyPerUnit = new Decimal(output.refQtyPerUnit);
    if (refQtyPerUnit.lte(0)) {
      throw new TransformationError(
        `Falta cuanto producto lleva cada "${output.productName}". Sin eso no se puede repartir el costo.`,
      );
    }
    return {
      ...output,
      qty,
      refQtyPerUnit,
      extraCost: new Decimal(output.extraCostPerUnit ?? 0),
      equivalentQty: refQtyPerUnit.times(qty),
    };
  });

  const outputQtyInSource = parciales.reduce((sum, p) => sum.plus(p.equivalentQty), new Decimal(0));

  const resultados: TransformationOutputResult[] = parciales.map((p) => {
    // El costo se reparte en proporcion al producto de origen que se llevo cada salida: una
    // porcion de 100 g carga mas que una de 80 g, y una tanda que perdio mucho carga la merma
    // completa entre las piezas que si salieron.
    const baseCostPerUnit = totalCost.times(p.refQtyPerUnit).dividedBy(outputQtyInSource);
    return {
      productId: p.productId,
      productName: p.productName,
      qty: p.qty,
      refQtyPerUnit: p.refQtyPerUnit,
      equivalentQty: p.equivalentQty,
      baseCostPerUnit,
      extraCostPerUnit: p.extraCost,
      unitCost: baseCostPerUnit.plus(p.extraCost),
      theoreticalUnitCost: p.refQtyPerUnit.times(bruto).plus(p.extraCost),
    };
  });

  const realYieldPct = outputQtyInSource.dividedBy(initial).times(100);

  return {
    initialQty: initial,
    outputQtyInSource,
    mermaQty: initial.minus(outputQtyInSource),
    realYieldPct,
    mermaPct: new Decimal(100).minus(realYieldPct),
    totalCost,
    excedeEntrada: outputQtyInSource.gt(initial),
    outputs: resultados,
  };
}

export type TransformationProduct = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  baseUnitLabel: string;
  isProcessed: boolean;
  /** Costo por unidad aprovechable (el del catalogo, con el rendimiento ya aplicado). */
  currentUnitCost: string;
  /** Costo por unidad comprada, sin rendimiento: lo que de verdad costo lo que entra. */
  grossUnitCost: string;
  yieldPercentage: string;
  /** Solo porciones: cuanto producto de origen lleva una porcion, y en que unidad se midio. */
  portionQty: string | null;
  portionUnit: UnitValue | null;
  /** De que producto sale normalmente esta porcion. Solo sirve para ordenar la captura. */
  defaultSourceProductId: string | null;
  /** Costo de los agregados de cada porcion, calculado hoy desde su receta. */
  extraCostPerUnit: string;
  extrasRecipeName: string | null;
};

/**
 * Cuanto producto de origen representa UNA unidad de salida.
 *
 * Una porcion lo dice en su ficha (20 g). Un granel que sale en la misma clase de unidad que el
 * origen se convierte directo (1 kg de limpio = 1 kg de crudo). Si no se puede deducir —piezas
 * que salen de un producto que se mide en kilos y nadie capturo el gramaje— se devuelve null y
 * la pantalla pide el dato en vez de inventarlo.
 */
export function resolveRefQtyPerUnit(
  sourceBaseUnit: UnitValue,
  output: { baseUnit: UnitValue; portionQty: string | null; portionUnit: UnitValue | null },
): Decimal | null {
  if (output.portionQty && output.portionUnit) {
    try {
      const ref = convertQty(output.portionQty, output.portionUnit, sourceBaseUnit);
      return ref.gt(0) ? ref : null;
    } catch {
      return null;
    }
  }
  try {
    const ref = convertQty(1, output.baseUnit, sourceBaseUnit);
    return ref.gt(0) ? ref : null;
  } catch {
    return null;
  }
}
