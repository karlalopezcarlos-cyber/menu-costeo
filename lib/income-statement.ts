import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { computeTaxes, sinIva } from "@/lib/taxes";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import type { ExpenseGroup } from "@/generated/prisma/client";
import {
  EXPENSE_GROUP_LABELS,
  EXPENSE_GROUP_ORDER,
  SIN_GRUPO_GASTO,
  type ExpenseGroupKey,
} from "@/lib/expense-groups";
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
  /// Lo que se echo a perder. No se resta del costo —tirar producto es costo de operar— pero se
  /// muestra aparte para saber cuanto de ese costo es desperdicio.
  mermas: GroupAmounts;
  /// Todo lo que no es costo de lo vendido: el modulo de Gastos, las compras de categorias
  /// marcadas como gasto, y lo que salio del inventario sin venderse. Es la suma de los tres
  /// desgloses de abajo, que existen para poder cuadrarlo contra cada modulo por separado.
  gastosDeOperacion: GroupAmounts;
  /// Solo lo capturado en el modulo de Gastos (renta, luz, nomina).
  gastosDeModulo: number;
  /// Solo las compras de categorias marcadas como gasto (agua, gas, desechables, limpieza).
  comprasDeGasto: number;
  /// Solo las mermas y las salidas por creditos al costo, valuadas.
  salidasSinVenta: number;
  /// Los gastos partidos en los cuatro grupos del reporte, mas lo que falta por clasificar.
  gastosPorGrupo: Record<ExpenseGroupKey, number>;
  /// Merma + consumo operativo + pruebas de menu, en un solo renglon.
  creditosYMermas: GroupAmounts;
  /// Costo de ventas menos los creditos al costo: lo que costo exclusivamente lo que se vendio.
  costoNetoDeVentas: GroupAmounts;
  /// Con que vista se calculo este resultado.
  ivaView: IvaView;
  /// La tasa de IVA de ventas que se uso para desbrutear, en por ciento.
  salesIvaRate: number;
  costoDeVentas: GroupAmounts;
  costoPotencial: GroupAmounts;
  /**
   * El periodo no tiene nada de almacen: ni inventarios, ni compras, ni traspasos.
   *
   * Pasa con el restaurante que todavia no captura compras y solo sube sus ventas. Ahi el costo
   * de ventas real no existe -es inventario inicial + compras - inventario final, y los tres son
   * cero-, asi que el unico costo que hay es el teorico. El reporte se recorta a lo que si se
   * puede sostener con datos y deja de pintar diez renglones en ceros.
   */
  sinAlmacen: boolean;
  /**
   * El costo con el que se calcula la utilidad: el real cuando hay almacen, el teorico cuando no.
   * Existe para que la pantalla, el PDF y el Excel no tengan que decidirlo cada uno por su lado.
   */
  costoReconocido: GroupAmounts;
  variacion: GroupAmounts;
  ventaPromedioDiaria: GroupAmounts;
  /** Total pagado a proveedores (SupplierPayment) en el periodo. No se desglosa por grupo porque
   * un pago es a un proveedor, no a una categoria especifica. */
  montoPagado: number;
  /** Lo que se les debe a los proveedores al cierre del periodo: todo lo comprado con proveedor
   * hasta la fecha final, menos todo lo pagado hasta esa misma fecha. Es un saldo acumulado, no
   * un movimiento del periodo, y por eso no entra en la utilidad. */
  saldoProveedores: number;
};

export type PctMode = "share" | "costPct" | "none";

export {
  SIN_GRUPO_GASTO,
  EXPENSE_GROUP_LABELS,
  EXPENSE_GROUP_ORDER,
  type ExpenseGroupKey,
} from "@/lib/expense-groups";

/**
 * Renglon del pie del reporte: un solo numero consolidado, sin desglose por grupo de costo.
 *
 * Aqui viven las cosas que no se pueden repartir entre alimento y bebidas: lo que se le pago a
 * los proveedores, el promedio diario y —sobre todo— los gastos. La renta no es de alimentos ni
 * de bebidas, es del negocio entero; partirla entre columnas seria inventarse un criterio.
 */
export type IncomeStatementFooterRow = {
  label: string;
  amount: number;
  /** % respecto a la venta total del periodo, cuando significa algo. */
  pct: number | null;
  bold?: boolean;
  highlight?: boolean;
  /** Renglon de desglose: cuelga del de arriba y no se suma aparte. */
  detail?: boolean;
};

/**
 * Con que numeros se lee el reporte.
 *
 * Los costos son SIEMPRE netos: el precio de compra se captura sin impuesto y el IVA de
 * compras es acreditable, asi que inventarios, compras, costo de ventas y costo potencial no
 * cambian entre una vista y otra. Lo que cambia son los dos renglones que se capturan en
 * bruto —las ventas, que son precio de carta, y los gastos, que son el total del recibo— y con
 * ellos todos los porcentajes, porque el denominador es la venta total.
 *
 * "sinIva" es la vista correcta y la que viene por omision: es la unica en la que el costo de
 * ventas y la venta estan medidos con la misma regla. "conIva" existe porque es como se venia
 * leyendo el reporte y como se ve el dinero en el banco.
 */
export type IvaView = "sinIva" | "conIva";

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

  // Sin almacen no hay de donde sacar inventarios, compras, costo real ni variacion. Pintarlos
  // en ceros no informa: hace creer que el dato existe y vale cero. Se muestra lo que si se
  // sostiene, y el costo se nombra "estimado" para que nadie lo lea como el costo real.
  if (result.sinAlmacen) {
    return [
      buildRow("Venta servicio", result.ventasNetasPV, "share", con()),
      ...(result.salidasAOtraSucursal.consolidado !== 0
        ? [buildRow("Otras ventas", result.salidasAOtraSucursal, "share", con())]
        : []),
      buildRow("Venta total", result.ventaTotal, "share", con({ bold: true })),
      buildRow("Costo de ventas estimado", result.costoReconocido, "costPct", con({
        bold: true,
        highlight: true,
        ventaTotal: result.ventaTotal,
      })),
    ];
  }

  return [
    buildRow("Venta servicio", result.ventasNetasPV, "share", con()),
    buildRow("Otras ventas", result.salidasAOtraSucursal, "share", con()),
    buildRow("Venta total", result.ventaTotal, "share", con({ bold: true })),
    buildRow("Inventario inicial", result.inventarioInicial, "none", con()),
    buildRow("Otras compras", result.entradasDesdeOtraSucursal, "none", con()),
    buildRow("Compras directas", result.compras, "costPct", con({ ventaTotal: result.ventaTotal })),
    // "Existencia" (inicial + entradas + compras) se sigue calculando porque el costo de ventas
    // sale de ahi, pero no se muestra: es un subtotal intermedio que nadie lee y que solo hace
    // mas larga la tabla.
    buildRow("Inventario final", result.inventarioFinal, "none", con()),
    buildRow("Costo de ventas", result.costoDeVentas, "costPct", con({
      bold: true,
      highlight: true,
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Creditos al costo", result.creditosYMermas, "costPct", con({
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Costo neto de ventas", result.costoNetoDeVentas, "costPct", con({
      bold: true,
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Costo teorico de ventas", result.costoPotencial, "costPct", con({
      highlight: true,
      ventaTotal: result.ventaTotal,
    })),
    buildRow("Variacion", result.variacion, "costPct", con({ ventaTotal: result.ventaTotal })),
  ];
}

/**
 * El pie del reporte, debajo de la tabla por grupos: de la utilidad bruta se bajan los gastos
 * para llegar a la utilidad despues de gastos. Compartido entre la pagina, el PDF y el Excel.
 */
export function buildIncomeStatementFooterRows(
  result: IncomeStatementResult,
): IncomeStatementFooterRow[] {
  const ventaTotal = result.ventaTotal.consolidado;
  const pct = (n: number) => (ventaTotal !== 0 ? (n / ventaTotal) * 100 : null);
  const utilidadAntesDeGastos = ventaTotal - result.costoReconocido.consolidado;
  const totalGastos = result.gastosDeOperacion.consolidado;
  const utilidad = utilidadAntesDeGastos - totalGastos;

  const rows: IncomeStatementFooterRow[] = [
    {
      label: "Utilidad antes de gastos",
      amount: utilidadAntesDeGastos,
      pct: pct(utilidadAntesDeGastos),
      bold: true,
    },
  ];

  // Un renglon por grupo. Los que estan en cero no se pintan: un reporte lleno de ceros hace
  // trabajar al ojo para nada. "Sin grupo asignado" es la excepcion -si trae dinero hay que
  // verlo, porque es justo lo que falta clasificar.
  for (const key of EXPENSE_GROUP_ORDER) {
    const monto = result.gastosPorGrupo[key] ?? 0;
    if (monto === 0) continue;
    rows.push({ label: EXPENSE_GROUP_LABELS[key], amount: monto, pct: null, detail: true });
  }

  rows.push({ label: "Total de gastos", amount: totalGastos, pct: pct(totalGastos) });

  // El desglose por modulo se queda, debajo del total: es lo unico que permite cuadrar los
  // gastos contra cada pantalla de la app por separado. Los grupos de arriba parten el mismo
  // dinero por tipo; estos dos lo parten por de donde salio.
  rows.push(
    { label: "— Gastos (modulo de Gastos)", amount: result.gastosDeModulo, pct: null, detail: true },
    { label: "— Compras de categorias de gasto", amount: result.comprasDeGasto, pct: null, detail: true },
  );

  rows.push({
    label: "Utilidad antes de impuestos",
    amount: utilidad,
    pct: pct(utilidad),
    bold: true,
    highlight: true,
  });

  // Va al final, despues de la utilidad y no entre la utilidad y los gastos: es una deuda
  // acumulada, no un costo del periodo. Metida en medio de la resta se leeria como si tambien
  // se restara.
  // Sin compras capturadas no hay deuda con proveedores que reportar, y un cero aqui se leeria
  // como "no se le debe a nadie" en vez de "no se captura".
  if (!result.sinAlmacen || result.saldoProveedores !== 0 || result.montoPagado !== 0) {
    rows.push(
      { label: "Saldo a proveedores al dia", amount: result.saldoProveedores, pct: null },
      { label: "Monto pagado", amount: result.montoPagado, pct: null },
    );
  }

  rows.push(
    {
      label: "Venta promedio diaria",
      amount: result.ventaPromedioDiaria.consolidado,
      pct: null,
      bold: true,
    },
  );

  return rows;
}

export const INCOME_STATEMENT_ROW_DESCRIPTIONS: Record<string, string> = {
  "Venta servicio": "Ingresos por venta directa en esta sucursal (cantidad vendida x precio de venta).",
  "Otras ventas": "Valor, a costo, de productos y subrecetas enviados a otra sucursal por requisicion.",
  "Venta total": "Venta servicio + Otras ventas.",
  "Inventario inicial": "Valor de los productos contados en el conteo de inventario inicial del periodo.",
  "Otras compras": "Valor, a costo, de productos y subrecetas recibidos de otra sucursal por requisicion.",
  "Compras directas":
    "Compras de producto del periodo (el % es respecto a la Venta total), que aqui va del dia siguiente al conteo inicial hasta el dia del conteo final: no es el mes de calendario. Lo comprado el dia del conteo inicial ya esta dentro de ese conteo y cuenta en el periodo anterior. NO incluye las compras de categorias marcadas como gasto en Configuracion > Categorias (agua, gas, desechables, limpieza): esas se van completas al bloque de gastos. Por eso este renglon suele ser menor que el total del modulo de Compras para las mismas fechas, y la diferencia entre los dos es exactamente lo que se compro en categorias de gasto.",
  "Inventario final": "Valor de los productos contados en el conteo de inventario final del periodo.",
  "Costo de ventas":
    "Lo que salio del almacen en el periodo: inventario inicial + otras compras + compras directas - inventario final. Es todo lo que salio, se haya vendido o no: la merma y las cortesias todavia estan aqui adentro, y se leen en el renglon de abajo. El % es respecto a la Venta total.",
  "Creditos al costo":
    "Lo que salio del inventario sin venderse: merma (se echo a perder, se cayo, caduco), consumo operativo (cortesias y consumo de personal) y pruebas de menu. Los tres se capturan en el modulo de Mermas y salidas. No se restan de la utilidad por separado porque ya vienen dentro del Costo de ventas de arriba; este renglon sirve para saber cuanto de ese costo no fue venta.",
  "Costo neto de ventas":
    "Costo de ventas - Creditos al costo: lo que costo exclusivamente lo que si se vendio. Es el numero que se compara contra el Costo teorico de ventas, porque el teorico solo habla de los platillos vendidos.",
  "Costo teorico de ventas":
    "Lo que, segun las recetas, debieron costar los platillos vendidos en el periodo. El % es respecto a la Venta total.",
  "Costo de ventas estimado":
    "Lo que, segun el costo de cada platillo, debieron costar los platillos vendidos en el periodo. Se usa como costo de ventas porque en este periodo no hay nada de almacen -ni inventarios, ni compras, ni traspasos- y el costo real no se puede calcular sin eso. Dice cuanto se gano en teoria, no cuanto se gano: la diferencia entre los dos es justo lo que se descubre al empezar a capturar compras e inventarios. El % es respecto a la Venta total.",
  Variacion:
    "Costo teorico de ventas - Costo neto de ventas: positivo significa que lo vendido costo menos que lo que decian las recetas (favorable). Se compara contra el costo NETO para no contar la merma dos veces: la merma ya tiene su propio renglon.",
  "Utilidad antes de gastos":
    "Venta total - Costo de ventas. Es lo que deja la operacion antes de los gastos del negocio. El % es respecto a la Venta total.",
  "Gastos de administracion": "La parte de los gastos del periodo cuyo tipo esta marcado como administracion en Configuracion > Tipos de gasto.",
  "Gastos de operacion": "La parte de los gastos del periodo cuyo tipo esta marcado como operacion en Configuracion > Tipos de gasto.",
  "Gastos de personal": "La parte de los gastos del periodo cuyo tipo esta marcado como personal en Configuracion > Tipos de gasto.",
  "Gastos financieros": "La parte de los gastos del periodo cuyo tipo esta marcado como financieros en Configuracion > Tipos de gasto.",
  "Sin grupo asignado":
    "Gastos cuyo tipo todavia no tiene grupo. No se reparten a ningun renglon porque nadie ha dicho a cual van: asignales grupo en Configuracion > Tipos de gasto (o en Configuracion > Categorias, si son compras de categorias de gasto) y este renglon desaparece.",
  "Total de gastos":
    "Suma de todos los grupos de gastos: el modulo de Gastos (renta, luz, nomina) mas las compras de categorias marcadas como gasto (agua, gas, desechables, limpieza). No entran al costo de ventas porque no son parte de lo que se vende, y no se reparten entre las columnas porque no son de alimentos ni de bebidas: son del negocio entero. El % es respecto a la Venta total.",
  "— Gastos (modulo de Gastos)":
    "El mismo dinero de arriba, partido por de donde salio en vez de por tipo. Esta parte sale del modulo de Gastos y cuadra contra el total de esa pantalla para las mismas fechas.",
  "— Compras de categorias de gasto":
    "La parte del total de gastos que son compras de productos cuya categoria esta marcada como gasto en Configuracion > Categorias. Es exactamente lo que le falta al renglon de Compras directas para cuadrar contra el modulo de Compras.",
  "Utilidad antes de impuestos":
    "Utilidad antes de gastos - Total de gastos. El % es respecto a la Venta total.",
  "Monto pagado": "Total pagado a proveedores (modulo de Pagos) con fecha de pago dentro del periodo.",
  "Saldo a proveedores al dia":
    "Lo que se les debe a los proveedores al cierre del periodo: todo lo comprado con proveedor asignado hasta la fecha final, menos todo lo pagado hasta esa misma fecha. Es un saldo acumulado que viene arrastrando de periodos anteriores, no un gasto de este periodo, por eso no se resta de la utilidad. Las compras sin proveedor no cuentan: no hay a quien deberle.",
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
  product?: { category?: { costGroupId: string | null; isExpense?: boolean } | null } | null;
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
  ivaView: IvaView = "sinIva",
): Promise<IncomeStatementResult> {
  const [
    sucursal,
    organization,
    costGroups,
    categoriasDeProducto,
    categoriasDeReceta,
    initialCount,
    finalCount,
  ] = await Promise.all([
    prisma.sucursal.findFirstOrThrow({ where: { id: sucursalId }, select: { name: true } }),
    prisma.organization.findFirstOrThrow({
      where: { id: organizationId },
      select: { name: true, salesIvaRate: true },
    }),
    prisma.costGroup.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.productCategory.findMany({
      where: { organizationId },
      select: { costGroupId: true, isExpense: true },
    }),
    prisma.recipeCategory.findMany({
      where: { organizationId },
      select: { costGroupId: true },
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

  // Un grupo de costo al que solo cuelgan categorias de gasto no merece columna: sus montos ya
  // no se reparten por grupo, asi que la columna saldria en ceros de arriba a abajo. Si algun
  // dia se le asigna una categoria que si se vende, la columna vuelve sola.
  const gruposConVenta = new Set<string>();
  const gruposSoloGasto = new Set<string>();
  for (const categoria of categoriasDeProducto) {
    if (!categoria.costGroupId) continue;
    (categoria.isExpense ? gruposSoloGasto : gruposConVenta).add(categoria.costGroupId);
  }
  for (const categoria of categoriasDeReceta) {
    if (categoria.costGroupId) gruposConVenta.add(categoria.costGroupId);
  }
  const gruposOcultos = new Set(
    [...gruposSoloGasto].filter((id) => !gruposConVenta.has(id)),
  );

  const rangeStart = initialCount.date;
  const rangeEnd = finalCount.date;
  // El periodo abre el dia DESPUES del conteo inicial y cierra el dia del conteo final. Un
  // conteo se levanta al cierre del dia, asi que lo que entro y salio el dia del conteo inicial
  // ya esta dentro de ese conteo: volverlo a sumar contaba la misma mercancia dos veces —y el
  // reporte del periodo anterior, que termina en ese mismo conteo, ya la habia contado—. Con
  // lte al final queda simetrico: ningun dia se cuenta dos veces ni se queda sin contar. Es el
  // mismo corte que usa la Auditoria (ver lib/audit.ts), que siempre lo hizo asi.
  const dateFilter = { gt: rangeStart, lte: rangeEnd };

  const [
    sales,
    requisicionesOut,
    requisicionesIn,
    purchases,
    gastos,
    payments,
    compradoAlCierre,
    pagadoAlCierre,
    creditos,
    graph,
  ] = await Promise.all([
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
    prisma.expense.findMany({
      where: { sucursalId, date: dateFilter },
      select: { amount: true, ivaRate: true, category: { select: { expenseGroup: true } } },
    }),
    prisma.supplierPayment.findMany({
      where: { sucursalId, paidDate: dateFilter },
      select: { amount: true },
    }),
    // Saldo al cierre: todo lo comprado y lo pagado hasta la fecha final, no solo lo del
    // periodo. Un saldo es una deuda acumulada; cortarla al periodo dejaria fuera lo que ya se
    // venia debiendo.
    prisma.purchase.aggregate({
      where: { sucursalId, supplierId: { not: null }, purchaseDate: { lte: rangeEnd } },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { sucursalId, paidDate: { lte: rangeEnd } },
      _sum: { amount: true },
    }),
    // Todo lo registrado en Mermas y salidas: los tres conceptos. Se separan al valuar, porque
    // no se tratan igual (ver mas abajo).
    prisma.wasteEntry.findMany({
      where: { sucursalId, date: dateFilter },
      include: {
        product: { include: { category: true } },
        subRecipe: { include: { category: true } },
      },
    }),
    loadOrgRecipeGraph(sucursalId),
  ]);

  // El precio de venta capturado es el de la carta y trae IVA. En la vista sin IVA se le quita
  // para poder compararlo contra un costo que siempre es neto; dejarlo bruto hacia que el costo
  // de ventas saliera mas bajo de lo que es, porque el denominador venia inflado.
  const salesIvaRate = Number(organization.salesIvaRate);
  const ventasNetasPV = zeroAmounts();
  for (const sale of sales) {
    const bruto = new Decimal(sale.quantitySold).times(sale.unitPrice);
    const value = ivaView === "sinIva" ? sinIva(bruto, salesIvaRate) : bruto;
    addTo(ventasNetasPV, sale.recipe.category?.costGroupId ?? null, value);
  }

  // Productos y subrecetas cuentan en los dos lados de la ecuacion: en los conteos y en las
  // transferencias. Si el inventario incluye lo que la cocina tiene preparado, una salsa que se
  // mando a otra sucursal tiene que salir como transferencia; si no, desapareceria del
  // inventario sin aparecer en ningun lado y se leeria como costo.
  const salidasAOtraSucursal = valuarConteo(requisicionesOut);
  const entradasDesdeOtraSucursal = valuarConteo(requisicionesIn);

  // Lo que se compra para vender va a Compras; lo que se compra para operar —agua, gas,
  // desechables— va a Gastos. Antes todo caia en Compras y por eso el costo de ventas incluia
  // cosas que nunca se vendieron.
  // Ningun gasto se reparte entre las columnas: ni los del modulo de Gastos (renta, luz,
  // nomina) ni las compras de categorias marcadas como gasto. No son de alimentos ni de
  // bebidas, son del negocio entero, asi que solo suman al consolidado y se leen en el pie del
  // reporte, debajo de la utilidad bruta.
  const compras = zeroAmounts();
  const gastosDeOperacion = zeroAmounts();
  // Las tres fuentes se llevan por separado ademas de sumadas: juntas no se pueden cuadrar
  // contra nada, porque cada una vive en un modulo distinto de la app.
  let gastosDeModulo = 0;
  let comprasDeGasto = 0;
  // Cada peso de gasto cae en el renglon de su grupo. SIN_GRUPO_GASTO no es un grupo: es la
  // lista de lo que nadie ha clasificado todavia, y se muestra aparte para que se note.
  const gastosPorGrupo = new Map<ExpenseGroupKey, number>();
  const sumarGasto = (grupo: ExpenseGroup | null, monto: number) => {
    const key: ExpenseGroupKey = grupo ?? SIN_GRUPO_GASTO;
    gastosPorGrupo.set(key, (gastosPorGrupo.get(key) ?? 0) + monto);
  };
  for (const purchase of purchases) {
    if (purchase.product.category?.isExpense) {
      // Estas compras no son costo de lo vendido, son gasto: se leen con la misma regla que el
      // resto del bloque de gastos. Se capturaron sin impuesto, asi que aqui se le suma.
      const monto =
        ivaView === "conIva"
          ? computeTaxes(purchase.totalPrice, {
              ivaRate: Number(purchase.ivaRate),
              iepsRate: Number(purchase.iepsRate),
            }).total
          : Number(purchase.totalPrice);
      comprasDeGasto += monto;
      gastosDeOperacion.consolidado += monto;
      sumarGasto(purchase.product.category?.expenseGroup ?? null, monto);
      continue;
    }
    addTo(compras, purchase.product.category?.costGroupId ?? null, new Decimal(purchase.totalPrice));
  }
  // El monto del gasto se captura con IVA, tal como viene el recibo. Cada gasto trae su propia
  // tasa congelada porque no todos lo causan: la renta si, la nomina no.
  for (const gasto of gastos) {
    const monto =
      ivaView === "sinIva"
        ? sinIva(gasto.amount, Number(gasto.ivaRate)).toNumber()
        : Number(gasto.amount);
    gastosDeModulo += monto;
    gastosDeOperacion.consolidado += monto;
    sumarGasto(gasto.category?.expenseGroup ?? null, monto);
  }

  // Un producto de gasto puede seguir contandose fisicamente, pero no puede entrar a la
  // ecuacion del costo: si su compra salio por un lado y su inventario entra por el otro, el
  // costo queda descuadrado.
  const esDeGasto = (item: ConteoItemValuable) =>
    item.product?.category?.isExpense === true;
  const inventarioInicial = valuarConteo(initialCount.items.filter((i) => !esDeGasto(i)));
  const inventarioFinal = valuarConteo(finalCount.items.filter((i) => !esDeGasto(i)));

  // Las tres salidas se valuan igual y las tres se tratan igual: salieron del inventario pero
  // no se vendieron. Se separan en dos renglones solo para poder leerlas —cuanto se regalo y
  // cuanto se tiro son preguntas distintas— pero las dos salen del costo de ventas y las dos
  // entran a Gastos de operacion.
  const creditosAlCosto = zeroAmounts();
  const mermas = zeroAmounts();
  for (const salida of creditos) {
    // Un producto de gasto nunca entro a la ecuacion del costo: su compra se fue completa a
    // Gastos y no se inventaria. Tirarlo no tiene de donde restarse, y sumarlo a los gastos lo
    // cobraria dos veces, una en la compra y otra aqui. Es el mismo criterio con el que ya se
    // filtran los dos conteos.
    if (esDeGasto(salida)) continue;
    const grupo =
      salida.product?.category?.costGroupId ?? salida.subRecipe?.category?.costGroupId ?? null;
    const valor = new Decimal(salida.quantity).times(salida.unitCost);
    addTo(salida.concept === "MERMA" ? mermas : creditosAlCosto, grupo, valor);
  }

  const ventaTotal = add(ventasNetasPV, salidasAOtraSucursal);
  const existencia = add(add(inventarioInicial, entradasDesdeOtraSucursal), compras);
  // Lo que salio sin venderse —cortesias, consumo de personal, pruebas y merma— ya estaba
  // descontado del inventario, asi que venia inflando el costo de ventas como si se hubiera
  // vendido. Restarlo deja el costo hablando solo de la venta, que es contra lo que se compara
  // el costo potencial.
  // El costo de ventas es lo que salio del almacen: existencia menos lo que quedo. Punto. No se
  // le descuenta nada aqui, porque tirar y regalar producto tambien es dinero que salio.
  const costoDeVentas = subtract(existencia, inventarioFinal);

  // Las tres salidas sin venta, en un solo renglon: merma, consumo operativo y pruebas. Antes
  // iban restadas del costo y sumadas a los gastos; ahora se quedan dentro del costo y se
  // muestran aparte, con el costo neto debajo. La utilidad final es exactamente la misma -por
  // un lado se restaba y por el otro se sumaba-, pero asi el costo de ventas cuadra contra el
  // almacen sin tener que explicar una resta intermedia.
  const creditosYMermas = add(creditosAlCosto, mermas);
  const costoNetoDeVentas = subtract(costoDeVentas, creditosYMermas);
  const salidasSinVenta = creditosYMermas.consolidado;

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

  // Contra el costo NETO, no contra el bruto. El costo teorico dice lo que debieron costar los
  // platillos vendidos; compararlo contra un costo que todavia trae la merma adentro llamaria
  // "variacion" a lo que ya tiene su propio renglon dos lineas arriba, y lo cobraria dos veces.
  const variacion = subtract(costoPotencial, costoNetoDeVentas);

  // Sin un solo movimiento de almacen en el periodo, el costo de ventas no es cero: no se sabe.
  // Son cosas distintas, y tratarlas igual haria que la utilidad fuera la venta completa. Se
  // reconoce entonces el costo teorico, que es el unico que si tiene de donde salir.
  const sinAlmacen =
    inventarioInicial.consolidado === 0 &&
    inventarioFinal.consolidado === 0 &&
    compras.consolidado === 0 &&
    entradasDesdeOtraSucursal.consolidado === 0;
  const costoReconocido = sinAlmacen ? costoPotencial : costoDeVentas;

  // La columna de "sin grupo" solo tiene caso si de verdad hay algo ahi. Se revisan todos los
  // renglones que se muestran, no unos cuantos: si un monto cae en un renglon que no se reviso,
  // la columna se esconderia y ese dinero no saldria en ninguna parte. Y se mide contra medio
  // centavo, no contra cero exacto, porque una columna que solo trae polvo de redondeo se
  // imprime completa en $0.00 y lo unico que hace es estorbar.
  const hayMontosSinGrupo = [
    ventasNetasPV,
    salidasAOtraSucursal,
    ventaTotal,
    inventarioInicial,
    entradasDesdeOtraSucursal,
    compras,
    inventarioFinal,
    creditosAlCosto,
    mermas,
    costoDeVentas,
    creditosYMermas,
    costoNetoDeVentas,
    costoPotencial,
    variacion,
  ].some((montos) => Math.abs(montos.byGroup[SIN_GRUPO] ?? 0) >= 0.005);

  const diasActivosSet = new Set(sales.map((s) => s.date.getTime()));
  const diasActivos = diasActivosSet.size;
  const ventaPromedioDiaria = divideScalar(ventaTotal, diasActivos);

  const montoPagado = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const saldoProveedores =
    Number(compradoAlCierre._sum.totalPrice ?? 0) - Number(pagadoAlCierre._sum.amount ?? 0);

  return {
    // La columna de "sin grupo" solo aparece si de verdad hay algo ahi: si todo esta acomodado,
    // no tiene caso una columna en cero recordandolo.
    groups: [
      ...costGroups.filter((g) => !gruposOcultos.has(g.id)),
      ...(hayMontosSinGrupo ? [{ id: SIN_GRUPO, name: "Sin grupo" }] : []),
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
    mermas,
    gastosDeOperacion,
    gastosDeModulo,
    comprasDeGasto,
    salidasSinVenta,
    gastosPorGrupo: Object.fromEntries(
      EXPENSE_GROUP_ORDER.map((key) => [key, gastosPorGrupo.get(key) ?? 0]),
    ) as Record<ExpenseGroupKey, number>,
    ivaView,
    salesIvaRate,
    costoDeVentas,
    creditosYMermas,
    costoNetoDeVentas,
    costoPotencial,
    sinAlmacen,
    costoReconocido,
    variacion,
    ventaPromedioDiaria,
    montoPagado,
    saldoProveedores,
  };
}
