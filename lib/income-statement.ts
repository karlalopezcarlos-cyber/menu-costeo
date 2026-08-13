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
  "Costo de ventas":
    "Existencia - Inventario final: costo real de todo lo que salio de la sucursal en el periodo (ventas, mermas, produccion, transferencias). El % es respecto a la Venta total.",
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
      include: { items: { where: { productId: { not: null } }, include: { product: { include: { category: true } } } } },
    }),
    prisma.inventoryCount.findFirstOrThrow({
      where: { id: finalCountId, sucursalId },
      include: { items: { where: { productId: { not: null } }, include: { product: { include: { category: true } } } } },
    }),
  ]);

  const rangeStart = initialCount.date;
  const rangeEnd = finalCount.date;
  const dateFilter = { gte: rangeStart, lte: rangeEnd };

  const [sales, requisicionesOut, requisicionesIn, purchases, payments, graph] = await Promise.all([
    prisma.dailySale.findMany({
      where: { sucursalId, date: dateFilter },
      include: { recipe: { include: { category: true } } },
    }),
    prisma.requisicionItem.findMany({
      where: { requisicion: { fromSucursalId: sucursalId, date: dateFilter } },
      include: { product: { include: { category: true } } },
    }),
    prisma.requisicionItem.findMany({
      where: { requisicion: { toSucursalId: sucursalId, date: dateFilter } },
      include: { product: { include: { category: true } } },
    }),
    prisma.purchase.findMany({
      where: { sucursalId, purchaseDate: dateFilter },
      include: { product: { include: { category: true } } },
    }),
    prisma.supplierPayment.findMany({
      where: { sucursalId, paidDate: dateFilter },
      select: { amount: true },
    }),
    loadOrgRecipeGraph(sucursalId),
  ]);

  const ventasNetasPV = zeroAmounts();
  for (const sale of sales) {
    const value = new Decimal(sale.quantitySold).times(sale.unitPrice);
    addTo(ventasNetasPV, sale.recipe.category?.group ?? null, value);
  }

  // Nota: igual que Inventario Inicial/Final, este reporte solo seguimiento a nivel de producto
  // (materia prima) para Existencia/Costo de Ventas, para no contar dos veces el valor de una
  // subreceta (su costo ya esta implicito en los productos consumidos para producirla). Las
  // requisiciones de subrecetas SI descuentan su propio inventario teorico (ver lib/audit.ts),
  // pero no entran a este calculo de Venta Total para no desbalancear esa ecuacion.
  const salidasAOtraSucursal = zeroAmounts();
  for (const item of requisicionesOut) {
    if (!item.product) continue;
    const value = new Decimal(item.quantity).times(item.unitCost);
    addTo(salidasAOtraSucursal, item.product.category?.group ?? null, value);
  }

  const entradasDesdeOtraSucursal = zeroAmounts();
  for (const item of requisicionesIn) {
    if (!item.product) continue;
    const value = new Decimal(item.quantity).times(item.unitCost);
    addTo(entradasDesdeOtraSucursal, item.product.category?.group ?? null, value);
  }

  const compras = zeroAmounts();
  for (const purchase of purchases) {
    addTo(compras, purchase.product.category?.group ?? null, new Decimal(purchase.totalPrice));
  }

  const inventarioInicial = zeroAmounts();
  for (const item of initialCount.items) {
    if (!item.product) continue;
    const value = new Decimal(item.quantity).times(item.unitCost);
    addTo(inventarioInicial, item.product.category?.group ?? null, value);
  }

  const inventarioFinal = zeroAmounts();
  for (const item of finalCount.items) {
    if (!item.product) continue;
    const value = new Decimal(item.quantity).times(item.unitCost);
    addTo(inventarioFinal, item.product.category?.group ?? null, value);
  }

  const ventaTotal = add(ventasNetasPV, salidasAOtraSucursal);
  const existencia = add(add(inventarioInicial, entradasDesdeOtraSucursal), compras);
  const costoDeVentas = subtract(existencia, inventarioFinal);

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
    costoDeVentas,
    costoPotencial,
    variacion,
    ventaPromedioDiaria,
    montoPagado,
  };
}
