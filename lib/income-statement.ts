import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
/** Columna del reporte: un grupo de costo de la organizacion. */
export type CostGroupRef = { id: string; name: string };

/** Clave de la columna de lo que no tiene grupo asignado. */
export const SIN_GRUPO = "__sin_grupo__";

/**
 * Montos separados por grupo de costo.
 *
 * Antes eran tres campos fijos (alimento, bebidas, miscelaneos). Ahora es un mapa por id de
 * grupo, porque cada organizacion define los suyos: una cafeteria quiere "cafe" y "reposteria",
 * una barra quiere "destilados" aparte de "cerveza".
 */
export type GroupAmounts = {
  byGroup: Record<string, number>;
  consolidado: number;
};

export type IncomeStatementResult = {
  /** Columnas del reporte, en orden, tal como las definio la organizacion. */
  groups: CostGroupRef[];
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

export type IncomeStatementCell = {
  /** id del grupo, SIN_GRUPO, o "consolidado" para la ultima columna. */
  key: string;
  amount: number;
  pct: number | null;
};

export type IncomeStatementRowView = {
  label: string;
  pctMode: PctMode;
  bold?: boolean;
  highlight?: boolean;
  cells: IncomeStatementCell[];
};

function amountOf(amounts: GroupAmounts, key: string): number {
  return key === "consolidado" ? amounts.consolidado : (amounts.byGroup[key] ?? 0);
}

function pctFor(
  amounts: GroupAmounts,
  key: string,
  pctMode: PctMode,
  ventaTotal?: GroupAmounts,
): number | null {
  if (pctMode === "share") {
    return amounts.consolidado !== 0 ? (amountOf(amounts, key) / amounts.consolidado) * 100 : null;
  }
  if (pctMode === "costPct" && ventaTotal) {
    const denom = amountOf(ventaTotal, key);
    return denom !== 0 ? (amountOf(amounts, key) / denom) * 100 : null;
  }
  return null;
}

function buildRow(
  label: string,
  amounts: GroupAmounts,
  pctMode: PctMode,
  opts: {
    bold?: boolean;
    highlight?: boolean;
    ventaTotal?: GroupAmounts;
    columns?: string[];
  } = {},
): IncomeStatementRowView {
  const columns = opts.columns ?? [...Object.keys(amounts.byGroup)];
  return {
    label,
    pctMode,
    bold: opts.bold,
    highlight: opts.highlight,
    cells: [...columns, "consolidado"].map((key) => ({
      key,
      amount: amountOf(amounts, key),
      pct: pctFor(amounts, key, pctMode, opts.ventaTotal),
    })),
  };
}

/** Las filas del cuerpo principal (Ventas...Variacion), compartidas entre la pagina, el PDF y el Excel. */
export function buildIncomeStatementRows(result: IncomeStatementResult): IncomeStatementRowView[] {
  const columns = result.groups.map((g) => g.id);
  const con = (opts: Parameters<typeof buildRow>[3] = {}) => ({ ...opts, columns });
  return [
    buildRow("Ventas netas PV", result.ventasNetasPV, "share", con()),
    buildRow("Salidas a otra sucursal", result.salidasAOtraSucursal, "share", con()),
    buildRow("Venta total", result.ventaTotal, "share", con({ bold: true })),
    buildRow("Inventario inicial", result.inventarioInicial, "none", con()),
    buildRow("Entradas desde otra sucursal", result.entradasDesdeOtraSucursal, "none", con()),
    buildRow("Compras", result.compras, "none", con()),
    // "Existencia" (inicial + entradas + compras) se sigue calculando porque el costo de ventas
    // sale de ahi, pero no se muestra: es un subtotal intermedio que nadie lee y que solo hace
    // mas larga la tabla.
    buildRow("Inventario final", result.inventarioFinal, "none", con()),
    buildRow("Salidas por creditos al costo", result.creditosAlCosto, "costPct", con({
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Costo de ventas", result.costoDeVentas, "costPct", con({
      bold: true,
      highlight: true,
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Costo potencial", result.costoPotencial, "costPct", con({
      highlight: true,
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Variacion", result.variacion, "costPct", con({ ventaTotal: result.ventaTotal })),
  ];
}

export const INCOME_STATEMENT_ROW_DESCRIPTIONS: Record<string, string> = {
  "Ventas netas PV": "Ingresos por venta directa en esta sucursal (cantidad vendida x precio de venta).",
  "Salidas a otra sucursal": "Valor, a costo, de productos y subrecetas enviados a otra sucursal por requisicion.",
  "Venta total": "Ventas netas PV + Salidas a otra sucursal.",
  "Inventario inicial": "Valor de los productos contados en el conteo de inventario inicial del periodo.",
  "Entradas desde otra sucursal": "Valor, a costo, de productos y subrecetas recibidos de otra sucursal por requisicion.",
  Compras: "Total de compras de productos registradas en el periodo.",
  "Inventario final": "Valor de los productos contados en el conteo de inventario final del periodo.",
  "Salidas por creditos al costo":
    "Lo que salio del inventario sin ser venta: cortesias y consumo de personal (salida a servicio) y pruebas de cocina. Se registran en Mermas y salidas. Se restan del costo de ventas porque no se vendieron; la merma no entra aqui, esa si es costo de operar.",
  "Costo de ventas":
    "Inventario inicial + Entradas + Compras - Inventario final - Salidas por creditos al costo: lo que de verdad costo lo que se vendio. Incluye mermas y variaciones de produccion, pero ya sin las cortesias ni las pruebas. El % es respecto a la Venta total.",
  "Costo potencial":
    "Costo teorico segun receta de lo que realmente se vendio (mismo calculo que Ingenieria de menu). El % es respecto a la Venta total.",
  Variacion: "Costo potencial - Costo de ventas: positivo significa que el costo real fue menor al teorico (favorable).",
  "Monto pagado": "Total pagado a proveedores (modulo de Pagos) con fecha de pago dentro del periodo.",
  "Venta promedio diaria": "Venta total del periodo entre los dias con venta registrada.",
};

function zeroAmounts(): GroupAmounts {
  return { byGroup: {}, consolidado: 0 };
}

function addTo(amounts: GroupAmounts, groupId: string | null, value: Decimal) {
  const n = value.toNumber();
  const key = groupId ?? SIN_GRUPO;
  amounts.consolidado += n;
  amounts.byGroup[key] = (amounts.byGroup[key] ?? 0) + n;
}

/** Combina dos mapas de montos recorriendo la union de sus grupos. */
function combine(a: GroupAmounts, b: GroupAmounts, op: (x: number, y: number) => number): GroupAmounts {
  const byGroup: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a.byGroup), ...Object.keys(b.byGroup)])) {
    byGroup[key] = op(a.byGroup[key] ?? 0, b.byGroup[key] ?? 0);
  }
  return { byGroup, consolidado: op(a.consolidado, b.consolidado) };
}

function subtract(a: GroupAmounts, b: GroupAmounts): GroupAmounts {
  return combine(a, b, (x, y) => x - y);
}

function add(a: GroupAmounts, b: GroupAmounts): GroupAmounts {
  return combine(a, b, (x, y) => x + y);
}

function divideScalar(a: GroupAmounts, n: number): GroupAmounts {
  if (n === 0) return zeroAmounts();
  const byGroup: Record<string, number> = {};
  for (const [key, value] of Object.entries(a.byGroup)) byGroup[key] = value / n;
  return { byGroup, consolidado: a.consolidado / n };
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
  product?: { category?: { costGroupId: string | null } | null } | null;
  subRecipe?: { category?: { costGroupId: string | null } | null } | null;
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
    const grupo =
      item.product?.category?.costGroupId ?? item.subRecipe?.category?.costGroupId ?? null;
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
  const [sucursal, organization, costGroups, initialCount, finalCount] = await Promise.all([
    prisma.sucursal.findFirstOrThrow({ where: { id: sucursalId }, select: { name: true } }),
    prisma.organization.findFirstOrThrow({ where: { id: organizationId }, select: { name: true } }),
    prisma.costGroup.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
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
    addTo(ventasNetasPV, sale.recipe.category?.costGroupId ?? null, value);
  }

  // Productos y subrecetas cuentan en los dos lados de la ecuacion: en los conteos y en las
  // transferencias. Si el inventario incluye lo que la cocina tiene preparado, una salsa que se
  // mando a otra sucursal tiene que salir como transferencia; si no, desapareceria del
  // inventario sin aparecer en ningun lado y se leeria como costo.
  const salidasAOtraSucursal = valuarConteo(requisicionesOut);
  const entradasDesdeOtraSucursal = valuarConteo(requisicionesIn);

  const compras = zeroAmounts();
  for (const purchase of purchases) {
    addTo(compras, purchase.product.category?.costGroupId ?? null, new Decimal(purchase.totalPrice));
  }

  const inventarioInicial = valuarConteo(initialCount.items);
  const inventarioFinal = valuarConteo(finalCount.items);

  const creditosAlCosto = zeroAmounts();
  for (const salida of creditos) {
    const grupo =
      salida.product?.category?.costGroupId ?? salida.subRecipe?.category?.costGroupId ?? null;
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
  const salesByRecipe = new Map<string, { quantitySold: Decimal; group: string | null }>();
  for (const sale of sales) {
    const existing = salesByRecipe.get(sale.recipeId);
    const qty = new Decimal(sale.quantitySold);
    if (existing) existing.quantitySold = existing.quantitySold.plus(qty);
    else
      salesByRecipe.set(sale.recipeId, {
        quantitySold: qty,
        group: sale.recipe.category?.costGroupId ?? null,
      });
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

  const montosConSinGrupo = new Set<string>();
  for (const montos of [
    ventasNetasPV,
    salidasAOtraSucursal,
    inventarioInicial,
    inventarioFinal,
    compras,
    entradasDesdeOtraSucursal,
    creditosAlCosto,
    costoPotencial,
  ]) {
    for (const [key, value] of Object.entries(montos.byGroup)) {
      if (key === SIN_GRUPO && value !== 0) montosConSinGrupo.add(SIN_GRUPO);
    }
  }

  const diasActivosSet = new Set(sales.map((s) => s.date.getTime()));
  const diasActivos = diasActivosSet.size;
  const ventaPromedioDiaria = divideScalar(ventaTotal, diasActivos);

  const montoPagado = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    // La columna de "sin grupo" solo aparece si de verdad hay algo ahi: si todo esta acomodado,
    // no tiene caso una columna en cero recordandolo.
    groups: [
      ...costGroups,
      ...(montosConSinGrupo.has(SIN_GRUPO) ? [{ id: SIN_GRUPO, name: "Sin grupo" }] : []),
    ],
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
