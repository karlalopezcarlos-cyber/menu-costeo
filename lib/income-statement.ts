import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { CategoryGroup } from "@/generated/prisma/client";

export const INCOME_STATEMENT_GROUPS: CategoryGroup[] = ["ALIMENTO", "BEBIDAS", "MISCELANEOS"];

export type GroupAmounts = {
  alimento: number;
  bebidas: number;
  miscelaneos: number;
  consolidado: number;
};

export type IncomeStatementResult = {
  sucursalName: string;
  organizationName: string;
  initialDateLabel: string;
  finalDateLabel: string;
  diasActivos: number;
  ventasNetasPV: GroupAmounts;
  salidasAOtraSucursal: GroupAmounts;
  ventaTotal: GroupAmounts;
  inventarioInicial: GroupAmounts;
  entradasDesdeOtraSucursal: GroupAmounts;
  compras: GroupAmounts;
  existencia: GroupAmounts;
  inventarioFinal: GroupAmounts;
  /// Salidas que no son venta: cortesias, consumo de personal y pruebas de cocina. Salieron del
  /// inventario, asi que ya venian metidas en el costo; se restan para que el costo de ventas
  /// hable solo de lo que se vendio.
  creditosAlCosto: GroupAmounts;
  costoDeVentas: GroupAmounts;
  costoPotencial: GroupAmounts;
  variacion: GroupAmounts;
  ventaPromedioDiaria: GroupAmounts;
  /** Total pagado a proveedores (SupplierPayment) en el periodo. No se desglosa por grupo porque
   * un pago es a un proveedor, no a una categoria especifica. */
  montoPagado: number;
};

export type PctMode = "share" | "costPct" | "none";

export type IncomeStatementRowView = {
  label: string;
  pctMode: PctMode;
  bold?: boolean;
  highlight?: boolean;
  alimento: number;
  alimentoPct: number | null;
  bebidas: number;
  bebidasPct: number | null;
  miscelaneos: number;
  miscelaneosPct: number | null;
  consolidado: number;
  consolidadoPct: number | null;
};

function pctFor(
  amounts: GroupAmounts,
  key: keyof GroupAmounts,
  pctMode: PctMode,
  ventaTotal?: GroupAmounts,
): number | null {
  if (pctMode === "share") {
    return amounts.consolidado !== 0 ? (amounts[key] / amounts.consolidado) * 100 : null;
  }
  if (pctMode === "costPct" && ventaTotal) {
    const denom = ventaTotal[key];
    return denom !== 0 ? (amounts[key] / denom) * 100 : null;
  }
  return null;
}

function buildRow(
  label: string,
  amounts: GroupAmounts,
  pctMode: PctMode,
  opts: { bold?: boolean; highlight?: boolean; ventaTotal?: GroupAmounts } = {},
): IncomeStatementRowView {
  return {
    label,
    pctMode,
    bold: opts.bold,
    highlight: opts.highlight,
    alimento: amounts.alimento,
    alimentoPct: pctFor(amounts, "alimento", pctMode, opts.ventaTotal),
    bebidas: amounts.bebidas,
    bebidasPct: pctFor(amounts, "bebidas", pctMode, opts.ventaTotal),
    miscelaneos: amounts.miscelaneos,
    miscelaneosPct: pctFor(amounts, "miscelaneos", pctMode, opts.ventaTotal),
    consolidado: amounts.consolidado,
    consolidadoPct: pctFor(amounts, "consolidado", pctMode, opts.ventaTotal),
  };
}

/** Las filas del cuerpo principal (Ventas...Variacion), compartidas entre la pagina, el PDF y el Excel. */
export function buildIncomeStatementRows(result: IncomeStatementResult): IncomeStatementRowView[] {
  return [
    buildRow("Ventas netas PV", result.ventasNetasPV, "share"),
    buildRow("Salidas a otra sucursal", result.salidasAOtraSucursal, "share"),
    buildRow("Venta total", result.ventaTotal, "share", { bold: true }),
    buildRow("Inventario inicial", result.inventarioInicial, "none"),
    buildRow("Entradas desde otra sucursal", result.entradasDesdeOtraSucursal, "none"),
    buildRow("Compras", result.compras, "none"),
    buildRow("Existencia", result.existencia, "none"),
    buildRow("Inventario final", result.inventarioFinal, "none"),
    buildRow("Salidas por creditos al costo", result.creditosAlCosto, "costPct", {
      ventaTotal: result.ventaTotal,
    }),
    buildRow("Costo de ventas", result.costoDeVentas, "costPct", {
      bold: true,
      highlight: true,
      ventaTotal: result.ventaTotal,
    }),
    buildRow("Costo potencial", result.costoPotencial, "costPct", {
      highlight: true,
      ventaTotal: result.ventaTotal,
    }),
    buildRow("Variacion", result.variacion, "costPct", { ventaTotal: result.ventaTotal }),
  ];
}

export const INCOME_STATEMENT_ROW_DESCRIPTIONS: Record<string, string> = {
  "Ventas netas PV": "Ingresos por venta directa en esta sucursal (cantidad vendida x precio de venta).",
  "Salidas a otra sucursal": "Valor, a costo, de productos y subrecetas enviados a otra sucursal por requisicion.",
  "Venta total": "Ventas netas PV + Salidas a otra sucursal.",
  "Inventario inicial": "Valor de los productos contados en el conteo de inventario inicial del periodo.",
  "Entradas desde otra sucursal": "Valor, a costo, de productos y subrecetas recibidos de otra sucursal por requisicion.",
  Compras: "Total de compras de productos registradas en el periodo.",
  Existencia: "Inventario inicial + Entradas desde otra sucursal + Compras.",
  "Inventario final": "Valor de los productos contados en el conteo de inventario final del periodo.",
  "Salidas por creditos al costo":
    "Lo que salio del inventario sin ser venta: cortesias y consumo de personal (salida a servicio) y pruebas de cocina. Se registran en Mermas y salidas. Se restan del costo de ventas porque no se vendieron; la merma no entra aqui, esa si es costo de operar.",
  "Costo de ventas":
    "Existencia - Inventario final - Salidas por creditos al costo: lo que de verdad costo lo que se vendio. Incluye mermas y variaciones de produccion, pero ya sin las cortesias ni las pruebas. El % es respecto a la Venta total.",
  "Costo potencial":
    "Costo teorico segun receta de lo que realmente se vendio (mismo calculo que Ingenieria de menu). El % es respecto a la Venta total.",
  Variacion: "Costo potencial - Costo de ventas: positivo significa que el costo real fue menor al teorico (favorable).",
  "Monto pagado": "Total pagado a proveedores (modulo de Pagos) con fecha de pago dentro del periodo.",
  "Venta promedio diaria": "Venta total del periodo entre los dias con venta registrada.",
};

function zeroAmounts(): GroupAmounts {
  return { alimento: 0, bebidas: 0, miscelaneos: 0, consolidado: 0 };
}

function addTo(amounts: GroupAmounts, group: CategoryGroup | null, value: Decimal) {
  const n = value.toNumber();
  amounts.consolidado += n;
  if (group === "ALIMENTO") amounts.alimento += n;
  else if (group === "BEBIDAS") amounts.bebidas += n;
  else amounts.miscelaneos += n;
}

function subtract(a: GroupAmounts, b: GroupAmounts): GroupAmounts {
  return {
    alimento: a.alimento - b.alimento,
    bebidas: a.bebidas - b.bebidas,
    miscelaneos: a.miscelaneos - b.miscelaneos,
    consolidado: a.consolidado - b.consolidado,
  };
}

function add(a: GroupAmounts, b: GroupAmounts): GroupAmounts {
  return {
    alimento: a.alimento + b.alimento,
    bebidas: a.bebidas + b.bebidas,
    miscelaneos: a.miscelaneos + b.miscelaneos,
    consolidado: a.consolidado + b.consolidado,
  };
}

function divideScalar(a: GroupAmounts, n: number): GroupAmounts {
  if (n === 0) return zeroAmounts();
  return {
    alimento: a.alimento / n,
    bebidas: a.bebidas / n,
    miscelaneos: a.miscelaneos / n,
    consolidado: a.consolidado / n,
  };
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

/**
 * Estado de resultados de una sucursal entre dos conteos de inventario, desglosado en las 3
 * columnas de CategoryGroup (categorias sin grupo asignado se consolidan en Miscelaneos). Sigue
 * el mismo esquema de columnas/filas que la hoja de calculo de referencia de la usuaria:
 * Venta Total = Ventas netas PV + Salidas a otra sucursal (a costo, via Requisiciones);
 * Costo de Ventas = Existencia (inicial + entradas + compras) - Inventario final — esto ya
 * incluye cualquier salida fisica del periodo (ventas, mermas, transferencias), porque el
 * conteo final las refleja; Costo Potencial es el costo teorico de receta de lo realmente
 * vendido (mismo motor que Ingenieria de Menu); Variacion = Costo Potencial - Costo de Ventas
 * (positivo = costo real favorable frente al teorico).
 */
/** Un renglon de conteo, de producto o de subreceta, con lo necesario para valuarlo. */
export type ConteoItemValuable = {
  quantity: Decimal.Value;
  unitCost: Decimal.Value;
  product?: { category?: { group: CategoryGroup | null } | null } | null;
  subRecipe?: { category?: { group: CategoryGroup | null } | null } | null;
};

/**
 * Cuanto vale un conteo de inventario.
 *
 * Cuenta productos Y subrecetas. Antes solo contaba productos, con el argumento de que el valor
 * de una subreceta ya estaba implicito en los insumos que la formaron. No es cierto en un
 * conteo fisico: los jitomates que se volvieron salsa ya no estan en la alacena, nadie los va a
 * contar; lo que esta es la salsa. Dejarla fuera no evitaba contar dos veces, simplemente
 * desaparecia del inventario todo lo que la cocina tuviera preparado.
 */
export function valuarConteo(items: ConteoItemValuable[]): GroupAmounts {
  const total = zeroAmounts();
  for (const item of items) {
    const grupo = item.product?.category?.group ?? item.subRecipe?.category?.group ?? null;
    addTo(total, grupo, new Decimal(item.quantity).times(item.unitCost));
  }
  return total;
}

export async function computeIncomeStatement(
  organizationId: string,
  sucursalId: string,
  initialCountId: string,
  finalCountId: string,
): Promise<IncomeStatementResult> {
  const [sucursal, organization, initialCount, finalCount] = await Promise.all([
    prisma.sucursal.findFirstOrThrow({ where: { id: sucursalId }, select: { name: true } }),
    prisma.organization.findFirstOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.inventoryCount.findFirstOrThrow({
      where: { id: initialCountId, sucursalId },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
            subRecipe: { include: { category: true } },
          },
        },
      },
    }),
    prisma.inventoryCount.findFirstOrThrow({
      where: { id: finalCountId, sucursalId },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
            subRecipe: { include: { category: true } },
          },
        },
      },
    }),
  ]);

  const rangeStart = initialCount.date;
  const rangeEnd = finalCount.date;
  const dateFilter = { gte: rangeStart, lte: rangeEnd };

  const [sales, requisicionesOut, requisicionesIn, purchases, payments, creditos, graph] =
    await Promise.all([
    prisma.dailySale.findMany({
      where: { sucursalId, date: dateFilter },
      include: { recipe: { include: { category: true } } },
    }),
    prisma.requisicionItem.findMany({
      where: { requisicion: { fromSucursalId: sucursalId, date: dateFilter } },
      include: {
        product: { include: { category: true } },
        subRecipe: { include: { category: true } },
      },
    }),
    prisma.requisicionItem.findMany({
      where: { requisicion: { toSucursalId: sucursalId, date: dateFilter } },
      include: {
        product: { include: { category: true } },
        subRecipe: { include: { category: true } },
      },
    }),
    prisma.purchase.findMany({
      where: { sucursalId, purchaseDate: dateFilter },
      include: { product: { include: { category: true } } },
    }),
    prisma.supplierPayment.findMany({
      where: { sucursalId, paidDate: dateFilter },
      select: { amount: true },
    }),
    // Cortesias, consumo de personal y pruebas. La merma no entra: esa si es costo de operar.
    prisma.wasteEntry.findMany({
      where: {
        sucursalId,
        date: dateFilter,
        concept: { in: ["SERVICIO", "PRUEBAS"] },
      },
      include: {
        product: { include: { category: true } },
        subRecipe: { include: { category: true } },
      },
    }),
    loadOrgRecipeGraph(sucursalId),
  ]);

  const ventasNetasPV = zeroAmounts();
  for (const sale of sales) {
    const value = new Decimal(sale.quantitySold).times(sale.unitPrice);
    addTo(ventasNetasPV, sale.recipe.category?.group ?? null, value);
  }

  // Productos y subrecetas cuentan en los dos lados de la ecuacion: en los conteos y en las
  // transferencias. Si el inventario incluye lo que la cocina tiene preparado, una salsa que se
  // mando a otra sucursal tiene que salir como transferencia; si no, desapareceria del
  // inventario sin aparecer en ningun lado y se leeria como costo.
  const salidasAOtraSucursal = valuarConteo(requisicionesOut);
  const entradasDesdeOtraSucursal = valuarConteo(requisicionesIn);

  const compras = zeroAmounts();
  for (const purchase of purchases) {
    addTo(compras, purchase.product.category?.group ?? null, new Decimal(purchase.totalPrice));
  }

  const inventarioInicial = valuarConteo(initialCount.items);
  const inventarioFinal = valuarConteo(finalCount.items);

  const creditosAlCosto = zeroAmounts();
  for (const salida of creditos) {
    const grupo =
      salida.product?.category?.group ?? salida.subRecipe?.category?.group ?? null;
    addTo(creditosAlCosto, grupo, new Decimal(salida.quantity).times(salida.unitCost));
  }

  const ventaTotal = add(ventasNetasPV, salidasAOtraSucursal);
  const existencia = add(add(inventarioInicial, entradasDesdeOtraSucursal), compras);
  // Lo que salio por cortesia o prueba ya estaba descontado del inventario, asi que venia
  // inflando el costo de ventas como si se hubiera vendido. Restarlo deja el costo hablando
  // solo de la venta, que es contra lo que se compara el costo potencial.
  const costoDeVentas = subtract(subtract(existencia, inventarioFinal), creditosAlCosto);

  const costoPotencial = zeroAmounts();
  const memo = new Map<string, Decimal>();
  const salesByRecipe = new Map<string, { quantitySold: Decimal; group: CategoryGroup | null }>();
  for (const sale of sales) {
    const existing = salesByRecipe.get(sale.recipeId);
    const qty = new Decimal(sale.quantitySold);
    if (existing) existing.quantitySold = existing.quantitySold.plus(qty);
    else salesByRecipe.set(sale.recipeId, { quantitySold: qty, group: sale.recipe.category?.group ?? null });
  }
  for (const [recipeId, agg] of salesByRecipe) {
    let unitCost = new Decimal(0);
    try {
      unitCost = getRecipeCost(recipeId, graph, memo);
    } catch {
      unitCost = new Decimal(0);
    }
    addTo(costoPotencial, agg.group, unitCost.times(agg.quantitySold));
  }

  const variacion = subtract(costoPotencial, costoDeVentas);

  const diasActivosSet = new Set(sales.map((s) => s.date.getTime()));
  const diasActivos = diasActivosSet.size;
  const ventaPromedioDiaria = divideScalar(ventaTotal, diasActivos);

  const montoPagado = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    sucursalName: sucursal.name,
    organizationName: organization.name,
    initialDateLabel: dateLabel(initialCount.date),
    finalDateLabel: dateLabel(finalCount.date),
    diasActivos,
    ventasNetasPV,
    salidasAOtraSucursal,
    ventaTotal,
    inventarioInicial,
    entradasDesdeOtraSucursal,
    compras,
    existencia,
    inventarioFinal,
    creditosAlCosto,
    costoDeVentas,
    costoPotencial,
    variacion,
    ventaPromedioDiaria,
    montoPagado,
  };
}
