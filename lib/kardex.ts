import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeUsagePerUnit, type RecipeGraph, type RecipeUsage } from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { ZONA_HORARIA } from "@/lib/format";
import { formatPurchaseFolio } from "@/lib/purchases/folio";
import { formatPortioningFolio } from "@/lib/portioning/query";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import { KARDEX_TYPE_LABELS, type KardexRow, type KardexType, type KardexTotals } from "@/lib/kardex-types";

export * from "@/lib/kardex-types";

/**
 * Kardex: todos los movimientos de inventario de los productos, en orden, con quien los capturo
 * y a que hora.
 *
 * Mide lo mismo que la auditoria, pero por movimiento en vez de por total y con fechas libres en
 * vez de conteo a conteo. Dos criterios que se heredan de ahi a proposito:
 *
 * - El consumo por venta es el de los productos que el platillo usa DIRECTO. Lo que entra via
 *   subreceta sale del inventario cuando la subreceta se produce, no cuando se vende el platillo;
 *   contarlo en los dos lados seria contarlo dos veces.
 * - Las compras salen de Compras y nada mas. Recibir un pedido registra la compra, asi que leer
 *   tambien los renglones del pedido duplicaria la entrada.
 */

function dateLabelOf(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

function timeLabelOf(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleTimeString("es-MX", { timeZone: ZONA_HORARIA, timeStyle: "short" });
}

type UserLike = { name: string | null; firstName: string | null; lastName: string | null; email: string } | null;

function userLabel(user: UserLike): string | null {
  if (!user) return null;
  const nombre = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return nombre || user.name || user.email;
}

const USER_SELECT = {
  select: { name: true, firstName: true, lastName: true, email: true },
} as const;

function safeUsage(recipeId: string, graph: RecipeGraph): RecipeUsage | null {
  try {
    return getRecipeUsagePerUnit(recipeId, graph);
  } catch {
    return null;
  }
}

/** Rango en UTC explicito: las fechas de los movimientos se guardan como medianoche UTC. */
function dateRange(dateFrom: string, dateTo: string) {
  return {
    ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
    ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
  };
}

export async function loadKardexRows(
  organizationId: string,
  sucursalId: string,
  options: { productId?: string; dateFrom: string; dateTo: string },
): Promise<KardexRow[]> {
  const { productId, dateFrom, dateTo } = options;
  if (!dateFrom && !dateTo) return [];
  const rango = dateRange(dateFrom, dateTo);
  const soloProducto = productId ? { productId } : {};

  const [
    products,
    purchases,
    wasteEntries,
    requisicionesOut,
    requisicionesIn,
    transformaciones,
    salidasDeTransformacion,
    producciones,
    sales,
    graph,
  ] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, ...(productId ? { id: productId } : {}) },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.purchase.findMany({
      where: { sucursalId, purchaseDate: rango, ...soloProducto },
      include: { supplier: { select: { name: true } }, createdBy: USER_SELECT },
    }),
    prisma.wasteEntry.findMany({
      where: { sucursalId, date: rango, productId: productId ?? { not: null } },
      include: { createdBy: USER_SELECT },
    }),
    prisma.requisicionItem.findMany({
      where: {
        requisicion: { fromSucursalId: sucursalId, date: rango },
        productId: productId ?? { not: null },
      },
      include: {
        requisicion: {
          include: { toSucursal: { select: { name: true } }, createdBy: USER_SELECT },
        },
      },
    }),
    prisma.requisicionItem.findMany({
      where: {
        requisicion: { toSucursalId: sucursalId, date: rango },
        productId: productId ?? { not: null },
      },
      include: {
        requisicion: {
          include: { fromSucursal: { select: { name: true } }, createdBy: USER_SELECT },
        },
      },
    }),
    prisma.portioningEntry.findMany({
      where: { sucursalId, date: rango, ...soloProducto },
      include: { createdBy: USER_SELECT },
    }),
    prisma.portioningOutput.findMany({
      where: {
        portioningEntry: { sucursalId, date: rango },
        productId: productId ?? { not: null },
      },
      include: {
        portioningEntry: {
          include: { product: { select: { name: true } }, createdBy: USER_SELECT },
        },
      },
    }),
    prisma.productionEntry.findMany({
      where: { sucursalId, date: rango },
      include: { subRecipe: { select: { name: true } }, createdBy: USER_SELECT },
    }),
    prisma.dailySale.findMany({
      where: { sucursalId, date: rango },
      include: { recipe: { select: { name: true } }, createdBy: USER_SELECT },
    }),
    loadOrgRecipeGraph(sucursalId),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const rows: KardexRow[] = [];

  function push(row: Omit<KardexRow, "typeLabel" | "productName" | "unitLabel"> & { productId: string }) {
    const product = productById.get(row.productId);
    if (!product) return;
    rows.push({
      ...row,
      productName: product.name,
      unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
      typeLabel: KARDEX_TYPE_LABELS[row.type],
    });
  }

  for (const purchase of purchases) {
    const product = productById.get(purchase.productId);
    if (!product) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(
        purchase.presentationQty,
        purchase.presentationUnit as UnitValue,
        product.baseUnit as UnitValue,
      );
    } catch {
      continue;
    }
    push({
      id: `compra-${purchase.id}`,
      dateValue: purchase.purchaseDate.getTime(),
      dateLabel: dateLabelOf(purchase.purchaseDate),
      timeLabel: timeLabelOf(purchase.createdAt),
      createdAtValue: purchase.createdAt.getTime(),
      productId: purchase.productId,
      type: "compra",
      reference: purchase.invoiceFolio || formatPurchaseFolio(purchase.folio),
      detail: [purchase.supplier?.name, purchase.presentationLabel, purchase.comment]
        .filter(Boolean)
        .join(" · "),
      qtyDelta: qtyInBase.toNumber(),
      userName: userLabel(purchase.createdBy),
      href: `/purchases/${purchase.folio}`,
    });
  }

  for (const entry of wasteEntries) {
    if (!entry.productId) continue;
    const product = productById.get(entry.productId);
    if (!product) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(entry.quantity, entry.unit as UnitValue, product.baseUnit as UnitValue);
    } catch {
      continue;
    }
    const type: KardexType =
      entry.concept === "SERVICIO" ? "servicio" : entry.concept === "PRUEBAS" ? "pruebas" : "merma";
    push({
      id: `merma-${entry.id}`,
      dateValue: entry.date.getTime(),
      dateLabel: dateLabelOf(entry.date),
      timeLabel: timeLabelOf(entry.createdAt),
      createdAtValue: entry.createdAt.getTime(),
      productId: entry.productId,
      type,
      reference: "",
      detail: entry.comment ?? "",
      qtyDelta: -qtyInBase.toNumber(),
      userName: userLabel(entry.createdBy),
      href: "/waste",
    });
  }

  for (const item of requisicionesOut) {
    if (!item.productId) continue;
    const product = productById.get(item.productId);
    if (!product) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(item.quantity, item.unit as UnitValue, product.baseUnit as UnitValue);
    } catch {
      continue;
    }
    push({
      id: `reqout-${item.id}`,
      dateValue: item.requisicion.date.getTime(),
      dateLabel: dateLabelOf(item.requisicion.date),
      timeLabel: timeLabelOf(item.requisicion.createdAt),
      createdAtValue: item.requisicion.createdAt.getTime(),
      productId: item.productId,
      type: "requisicion_salida",
      reference: formatRequisicionFolio(item.requisicion.folio),
      detail: `A ${item.requisicion.toSucursal.name}`,
      qtyDelta: -qtyInBase.toNumber(),
      userName: userLabel(item.requisicion.createdBy),
      href: `/requisitions/${item.requisicionId}`,
    });
  }

  for (const item of requisicionesIn) {
    if (!item.productId) continue;
    const product = productById.get(item.productId);
    if (!product) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(item.quantity, item.unit as UnitValue, product.baseUnit as UnitValue);
    } catch {
      continue;
    }
    push({
      id: `reqin-${item.id}`,
      dateValue: item.requisicion.date.getTime(),
      dateLabel: dateLabelOf(item.requisicion.date),
      timeLabel: timeLabelOf(item.requisicion.createdAt),
      createdAtValue: item.requisicion.createdAt.getTime(),
      productId: item.productId,
      type: "requisicion_entrada",
      reference: formatRequisicionFolio(item.requisicion.folio),
      detail: `De ${item.requisicion.fromSucursal.name}`,
      qtyDelta: qtyInBase.toNumber(),
      userName: userLabel(item.requisicion.createdBy),
      href: `/requisitions/${item.requisicionId}`,
    });
  }

  for (const entry of transformaciones) {
    push({
      id: `transout-${entry.id}`,
      dateValue: entry.date.getTime(),
      dateLabel: dateLabelOf(entry.date),
      timeLabel: timeLabelOf(entry.createdAt),
      createdAtValue: entry.createdAt.getTime(),
      productId: entry.productId,
      type: "transformacion_salida",
      reference: formatPortioningFolio(entry.folio),
      detail: entry.comment ?? "",
      qtyDelta: -Number(entry.initialQty),
      userName: userLabel(entry.createdBy),
      href: "/portioning",
    });
  }

  for (const output of salidasDeTransformacion) {
    if (!output.productId) continue;
    push({
      id: `transin-${output.id}`,
      dateValue: output.portioningEntry.date.getTime(),
      dateLabel: dateLabelOf(output.portioningEntry.date),
      timeLabel: timeLabelOf(output.portioningEntry.createdAt),
      createdAtValue: output.portioningEntry.createdAt.getTime(),
      productId: output.productId,
      type: "transformacion_entrada",
      reference: formatPortioningFolio(output.portioningEntry.folio),
      detail: `De ${output.portioningEntry.product.name}`,
      qtyDelta: Number(output.qty ?? 0),
      userName: userLabel(output.portioningEntry.createdBy),
      href: "/portioning",
    });
  }

  for (const entry of producciones) {
    const usage = safeUsage(entry.subRecipeId, graph);
    if (!usage) continue;
    for (const [usedProductId, perUnit] of usage.products) {
      if (productId && usedProductId !== productId) continue;
      if (perUnit.isZero()) continue;
      push({
        id: `prod-${entry.id}-${usedProductId}`,
        dateValue: entry.date.getTime(),
        dateLabel: dateLabelOf(entry.date),
        timeLabel: timeLabelOf(entry.createdAt),
        createdAtValue: entry.createdAt.getTime(),
        productId: usedProductId,
        type: "produccion_salida",
        reference: "",
        detail: `${Number(entry.quantity).toLocaleString("es-MX")} x ${entry.subRecipe.name}`,
        qtyDelta: -perUnit.times(entry.quantity).toNumber(),
        userName: userLabel(entry.createdBy),
        href: "/production",
      });
    }
  }

  // Las ventas se juntan por producto y por dia: un dia son cientos de platillos y cada uno
  // toca varios productos, asi que renglon por platillo volveria el kardex ilegible. El detalle
  // por platillo vive en la venta de ese dia.
  type VentaAgg = {
    qty: Decimal;
    platillos: Decimal;
    date: Date;
    createdAt: Date;
    usuarios: Set<string>;
  };
  const ventasPorProductoYDia = new Map<string, VentaAgg>();
  for (const sale of sales) {
    const usage = safeUsage(sale.recipeId, graph);
    if (!usage) continue;
    for (const [usedProductId, perUnit] of usage.products) {
      if (productId && usedProductId !== productId) continue;
      if (perUnit.isZero()) continue;
      const key = `${usedProductId}-${sale.date.getTime()}`;
      const actual = ventasPorProductoYDia.get(key) ?? {
        qty: new Decimal(0),
        platillos: new Decimal(0),
        date: sale.date,
        createdAt: sale.createdAt,
        usuarios: new Set<string>(),
      };
      actual.qty = actual.qty.plus(perUnit.times(sale.quantitySold));
      actual.platillos = actual.platillos.plus(sale.quantitySold);
      if (sale.createdAt > actual.createdAt) actual.createdAt = sale.createdAt;
      const usuario = userLabel(sale.createdBy);
      if (usuario) actual.usuarios.add(usuario);
      ventasPorProductoYDia.set(key, actual);
    }
  }
  for (const [key, venta] of ventasPorProductoYDia) {
    const usedProductId = key.slice(0, key.lastIndexOf("-"));
    push({
      id: `venta-${key}`,
      dateValue: venta.date.getTime(),
      dateLabel: dateLabelOf(venta.date),
      timeLabel: timeLabelOf(venta.createdAt),
      createdAtValue: venta.createdAt.getTime(),
      productId: usedProductId,
      type: "venta",
      reference: "",
      detail: `${venta.platillos.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} platillos vendidos`,
      qtyDelta: -venta.qty.toNumber(),
      userName:
        venta.usuarios.size === 1 ? [...venta.usuarios][0] : venta.usuarios.size > 1 ? "Varios" : null,
      href: "/sales",
    });
  }

  rows.sort(
    (a, b) =>
      a.dateValue - b.dateValue ||
      a.createdAtValue - b.createdAtValue ||
      a.productName.localeCompare(b.productName),
  );
  return rows;
}

export function filterKardexRows(
  rows: KardexRow[],
  filters: { search: string; folio: string; user: string; type: string },
): KardexRow[] {
  const search = filters.search.trim().toLowerCase();
  const folio = filters.folio.trim().toLowerCase();
  const usuario = filters.user.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.type && row.type !== filters.type) return false;
    if (folio && !row.reference.toLowerCase().includes(folio)) return false;
    if (usuario && (row.userName ?? "").toLowerCase() !== usuario) return false;
    if (search) {
      const texto = [row.productName, row.reference, row.detail, row.userName ?? "", row.typeLabel]
        .join(" ")
        .toLowerCase();
      if (!texto.includes(search)) return false;
    }
    return true;
  });
}

export function computeKardexTotals(rows: KardexRow[]): KardexTotals {
  let entradas = 0;
  let salidas = 0;
  const porTipo = new Map<KardexType, number>();
  for (const row of rows) {
    if (row.qtyDelta >= 0) entradas += row.qtyDelta;
    else salidas += -row.qtyDelta;
    porTipo.set(row.type, (porTipo.get(row.type) ?? 0) + row.qtyDelta);
  }
  return {
    entradas,
    salidas,
    porTipo: [...porTipo.entries()]
      .map(([type, qty]) => ({ type, label: KARDEX_TYPE_LABELS[type], qty }))
      .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty)),
  };
}

export type KardexOpening = {
  qty: number;
  /** De donde sale ese saldo: del ultimo conteo, o de arrastrar los movimientos desde el inicio. */
  basisLabel: string;
};

/**
 * Con cuanto empezo el periodo un producto.
 *
 * Se parte del ultimo conteo fisico anterior a la fecha inicial y se le suman los movimientos
 * que hubo entre ese conteo y el inicio del periodo. Si nunca se ha contado, se arrastra todo
 * desde el primer movimiento registrado, y se dice, porque ese numero vale mucho menos.
 */
export async function computeKardexOpening(
  organizationId: string,
  sucursalId: string,
  productId: string,
  dateFrom: string,
): Promise<KardexOpening> {
  if (!dateFrom) return { qty: 0, basisLabel: "Sin fecha inicial" };
  const inicio = new Date(`${dateFrom}T00:00:00.000Z`);

  const conteo = await prisma.inventoryCount.findFirst({
    where: { sucursalId, date: { lt: inicio } },
    orderBy: { date: "desc" },
    include: { items: { where: { productId } } },
  });

  const desde = conteo ? conteo.date : null;
  const base = conteo ? Number(conteo.items[0]?.quantity ?? 0) : 0;

  // Los movimientos del mismo dia del conteo ya estan reflejados en lo contado, asi que se
  // arranca del dia siguiente.
  const desdeLabel = desde
    ? new Date(desde.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "";
  const hastaLabel = new Date(inicio.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (desdeLabel && desdeLabel > hastaLabel) {
    return {
      qty: base,
      basisLabel: `Conteo del ${desde!.toLocaleDateString("es-MX", { timeZone: "UTC" })}`,
    };
  }

  const movimientos = await loadKardexRows(organizationId, sucursalId, {
    productId,
    dateFrom: desdeLabel || "2000-01-01",
    dateTo: hastaLabel,
  });
  const qty = movimientos.reduce((sum, row) => sum + row.qtyDelta, base);

  return {
    qty,
    basisLabel: desde
      ? `Conteo del ${desde.toLocaleDateString("es-MX", { timeZone: "UTC" })} mas sus movimientos`
      : "Sin conteo previo: arrastre de todos los movimientos",
  };
}
