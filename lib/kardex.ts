import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import {
  loadOrgRecipeGraph,
  getRecipeCost,
  getRecipeUsagePerUnit,
  getSucursalProductCosts,
  type RecipeGraph,
  type RecipeUsage,
} from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { ZONA_HORARIA } from "@/lib/format";
import { formatPurchaseFolio } from "@/lib/purchases/folio";
import { formatPortioningFolio } from "@/lib/portioning/query";
import { formatRequisicionFolio } from "@/lib/requisitions/folio";
import {
  KARDEX_TYPE_LABELS,
  type ArticuloTipo,
  type CorteRow,
  type InventarioAlCorte,
  type KardexRow,
  type KardexType,
  type KardexTotals,
} from "@/lib/kardex-types";

export * from "@/lib/kardex-types";

/**
 * Kardex: todos los movimientos de inventario, en orden, con quien los capturo y a que hora.
 *
 * Se mueven dos cosas y las dos llevan inventario propio: los PRODUCTOS del catalogo y las
 * SUBRECETAS de la sucursal. Una salsa se produce, se traspasa, se cuenta, se merma y se gasta
 * al vender el platillo que la lleva; nada de eso es un producto y todo eso es inventario.
 *
 * Mide lo mismo que la auditoria, pero por movimiento en vez de por total y con fechas libres en
 * vez de conteo a conteo. Dos criterios que se heredan de ahi a proposito:
 *
 * - El consumo es siempre de UN SOLO NIVEL: lo que la receta lista directo. Vender un platillo
 *   descuenta sus productos y sus subrecetas; lo que esas subrecetas llevan adentro ya salio
 *   cuando la subreceta se produjo. Bajar recursivamente lo contaria dos veces.
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

/** Un articulo del kardex: producto del catalogo o subreceta de esta sucursal. */
export type ArticuloRef = { id: string; tipo: "producto" | "subreceta"; nombre: string };

/**
 * De que es el id que mandaron: producto o subreceta.
 *
 * Se resuelve antes de consultar nada porque el filtro de base de datos no es el mismo para los
 * dos, y sin saberlo habria que traer todos los movimientos de la sucursal para tirar casi
 * todos en memoria.
 */
async function resolverArticulo(
  organizationId: string,
  sucursalId: string,
  articuloId: string,
): Promise<ArticuloRef | null> {
  const [producto, subreceta] = await Promise.all([
    prisma.product.findFirst({
      where: { id: articuloId, organizationId },
      select: { id: true, name: true },
    }),
    prisma.recipe.findFirst({
      where: { id: articuloId, sucursalId },
      select: { id: true, name: true },
    }),
  ]);
  if (producto) return { id: producto.id, tipo: "producto", nombre: producto.name };
  if (subreceta) return { id: subreceta.id, tipo: "subreceta", nombre: subreceta.name };
  return null;
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
  options: { articuloId?: string; dateFrom: string; dateTo: string },
): Promise<KardexRow[]> {
  const { articuloId, dateFrom, dateTo } = options;
  if (!dateFrom && !dateTo) return [];
  const rango = dateRange(dateFrom, dateTo);

  const filtro = articuloId ? await resolverArticulo(organizationId, sucursalId, articuloId) : null;
  // Pedir un articulo que no existe no es lo mismo que no pedir ninguno: lo segundo trae todo.
  if (articuloId && !filtro) return [];
  const filtroProducto = filtro?.tipo === "producto" ? filtro.id : null;
  const filtroSubreceta = filtro?.tipo === "subreceta" ? filtro.id : null;

  /** Filtro de renglon para las tablas que llevan productos y subrecetas en la misma columna. */
  const porArticulo = (campoSub: "subRecipeId" | "destSubRecipeId" = "subRecipeId") =>
    filtroProducto
      ? { productId: filtroProducto }
      : filtroSubreceta
        ? { [campoSub]: filtroSubreceta }
        : { OR: [{ productId: { not: null } }, { [campoSub]: { not: null } }] };

  const [
    products,
    recipes,
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
      where: { organizationId, ...(filtroProducto ? { id: filtroProducto } : {}) },
      select: { id: true, name: true, baseUnit: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId, ...(filtroSubreceta ? { id: filtroSubreceta } : {}) },
      select: { id: true, name: true, yieldUnit: true },
    }),
    // Solo los productos se compran: con el filtro en una subreceta no hay nada que leer.
    filtroSubreceta
      ? []
      : prisma.purchase.findMany({
          where: {
            sucursalId,
            purchaseDate: rango,
            ...(filtroProducto ? { productId: filtroProducto } : {}),
          },
          include: { supplier: { select: { name: true } }, createdBy: USER_SELECT },
        }),
    prisma.wasteEntry.findMany({
      where: { sucursalId, date: rango, ...porArticulo() },
      include: { createdBy: USER_SELECT },
    }),
    prisma.requisicionItem.findMany({
      where: { requisicion: { fromSucursalId: sucursalId, date: rango }, ...porArticulo() },
      include: {
        requisicion: {
          include: { toSucursal: { select: { name: true } }, createdBy: USER_SELECT },
        },
      },
    }),
    // El que recibe acredita SU copia de la subreceta, no la del que la mando: cada sucursal
    // tiene la suya y son renglones de inventario distintos.
    prisma.requisicionItem.findMany({
      where: {
        requisicion: { toSucursalId: sucursalId, date: rango },
        ...porArticulo("destSubRecipeId"),
      },
      include: {
        requisicion: {
          include: { fromSucursal: { select: { name: true } }, createdBy: USER_SELECT },
        },
      },
    }),
    // Lo que entra a transformarse siempre es un producto entero.
    filtroSubreceta
      ? []
      : prisma.portioningEntry.findMany({
          where: {
            sucursalId,
            date: rango,
            ...(filtroProducto ? { productId: filtroProducto } : {}),
          },
          include: { createdBy: USER_SELECT },
        }),
    prisma.portioningOutput.findMany({
      where: {
        portioningEntry: { sucursalId, date: rango },
        ...(filtroProducto
          ? { productId: filtroProducto }
          : filtroSubreceta
            ? { recipeId: filtroSubreceta }
            : { OR: [{ productId: { not: null } }, { recipeId: { not: null } }] }),
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
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const rows: KardexRow[] = [];

  type Base = Omit<KardexRow, "typeLabel" | "articuloNombre" | "unitLabel" | "articuloTipo">;

  function pushProducto(row: Base) {
    const product = productById.get(row.articuloId);
    if (!product) return;
    rows.push({
      ...row,
      articuloTipo: "producto",
      articuloNombre: product.name,
      unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
      typeLabel: KARDEX_TYPE_LABELS[row.type],
    });
  }

  function pushSubreceta(row: Base) {
    const recipe = recipeById.get(row.articuloId);
    if (!recipe) return;
    rows.push({
      ...row,
      articuloTipo: "subreceta",
      articuloNombre: recipe.name,
      unitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
      typeLabel: KARDEX_TYPE_LABELS[row.type],
    });
  }

  /** Pasa una cantidad a la unidad de inventario de la subreceta: su unidad de rendimiento. */
  function enUnidadDeSubreceta(
    subRecipeId: string,
    quantity: Decimal | number,
    unit: string,
  ): number | null {
    const recipe = recipeById.get(subRecipeId);
    if (!recipe) return null;
    try {
      return convertQty(quantity, unit as UnitValue, recipe.yieldUnit as UnitValue).toNumber();
    } catch {
      return null;
    }
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
    pushProducto({
      id: `compra-${purchase.id}`,
      dateValue: purchase.purchaseDate.getTime(),
      dateLabel: dateLabelOf(purchase.purchaseDate),
      timeLabel: timeLabelOf(purchase.createdAt),
      createdAtValue: purchase.createdAt.getTime(),
      articuloId: purchase.productId,
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
    const type: KardexType =
      entry.concept === "SERVICIO" ? "servicio" : entry.concept === "PRUEBAS" ? "pruebas" : "merma";
    const comun = {
      id: `merma-${entry.id}`,
      dateValue: entry.date.getTime(),
      dateLabel: dateLabelOf(entry.date),
      timeLabel: timeLabelOf(entry.createdAt),
      createdAtValue: entry.createdAt.getTime(),
      type,
      reference: "",
      detail: entry.comment ?? "",
      userName: userLabel(entry.createdBy),
      href: "/waste",
    };
    if (entry.productId) {
      const product = productById.get(entry.productId);
      if (!product) continue;
      let qtyInBase: Decimal;
      try {
        qtyInBase = convertQty(
          entry.quantity,
          entry.unit as UnitValue,
          product.baseUnit as UnitValue,
        );
      } catch {
        continue;
      }
      pushProducto({ ...comun, articuloId: entry.productId, qtyDelta: -qtyInBase.toNumber() });
    } else if (entry.subRecipeId) {
      const qty = enUnidadDeSubreceta(entry.subRecipeId, entry.quantity, entry.unit);
      if (qty === null) continue;
      pushSubreceta({ ...comun, articuloId: entry.subRecipeId, qtyDelta: -qty });
    }
  }

  for (const item of requisicionesOut) {
    const comun = {
      id: `reqout-${item.id}`,
      dateValue: item.requisicion.date.getTime(),
      dateLabel: dateLabelOf(item.requisicion.date),
      timeLabel: timeLabelOf(item.requisicion.createdAt),
      createdAtValue: item.requisicion.createdAt.getTime(),
      type: "requisicion_salida" as const,
      reference: formatRequisicionFolio(item.requisicion.folio),
      detail: `A ${item.requisicion.toSucursal.name}`,
      userName: userLabel(item.requisicion.createdBy),
      href: `/requisitions/${item.requisicionId}`,
    };
    if (item.productId) {
      const product = productById.get(item.productId);
      if (!product) continue;
      let qtyInBase: Decimal;
      try {
        qtyInBase = convertQty(item.quantity, item.unit as UnitValue, product.baseUnit as UnitValue);
      } catch {
        continue;
      }
      pushProducto({ ...comun, articuloId: item.productId, qtyDelta: -qtyInBase.toNumber() });
    } else if (item.subRecipeId) {
      const qty = enUnidadDeSubreceta(item.subRecipeId, item.quantity, item.unit);
      if (qty === null) continue;
      pushSubreceta({ ...comun, articuloId: item.subRecipeId, qtyDelta: -qty });
    }
  }

  for (const item of requisicionesIn) {
    const comun = {
      id: `reqin-${item.id}`,
      dateValue: item.requisicion.date.getTime(),
      dateLabel: dateLabelOf(item.requisicion.date),
      timeLabel: timeLabelOf(item.requisicion.createdAt),
      createdAtValue: item.requisicion.createdAt.getTime(),
      type: "requisicion_entrada" as const,
      reference: formatRequisicionFolio(item.requisicion.folio),
      detail: `De ${item.requisicion.fromSucursal.name}`,
      userName: userLabel(item.requisicion.createdBy),
      href: `/requisitions/${item.requisicionId}`,
    };
    if (item.productId) {
      const product = productById.get(item.productId);
      if (!product) continue;
      let qtyInBase: Decimal;
      try {
        qtyInBase = convertQty(item.quantity, item.unit as UnitValue, product.baseUnit as UnitValue);
      } catch {
        continue;
      }
      pushProducto({ ...comun, articuloId: item.productId, qtyDelta: qtyInBase.toNumber() });
    } else if (item.destSubRecipeId) {
      const qty = enUnidadDeSubreceta(item.destSubRecipeId, item.quantity, item.unit);
      if (qty === null) continue;
      pushSubreceta({ ...comun, articuloId: item.destSubRecipeId, qtyDelta: qty });
    }
  }

  for (const entry of transformaciones) {
    pushProducto({
      id: `transout-${entry.id}`,
      dateValue: entry.date.getTime(),
      dateLabel: dateLabelOf(entry.date),
      timeLabel: timeLabelOf(entry.createdAt),
      createdAtValue: entry.createdAt.getTime(),
      articuloId: entry.productId,
      type: "transformacion_salida",
      reference: formatPortioningFolio(entry.folio),
      detail: entry.comment ?? "",
      qtyDelta: -Number(entry.initialQty),
      userName: userLabel(entry.createdBy),
      href: "/portioning",
    });
  }

  for (const output of salidasDeTransformacion) {
    const comun = {
      id: `transin-${output.id}`,
      dateValue: output.portioningEntry.date.getTime(),
      dateLabel: dateLabelOf(output.portioningEntry.date),
      timeLabel: timeLabelOf(output.portioningEntry.createdAt),
      createdAtValue: output.portioningEntry.createdAt.getTime(),
      type: "transformacion_entrada" as const,
      reference: formatPortioningFolio(output.portioningEntry.folio),
      detail: `De ${output.portioningEntry.product.name}`,
      userName: userLabel(output.portioningEntry.createdBy),
      href: "/portioning",
    };
    if (output.productId) {
      pushProducto({ ...comun, articuloId: output.productId, qtyDelta: Number(output.qty ?? 0) });
    } else if (output.recipeId) {
      // Transformaciones viejas, de cuando una porcion era una receta. Siguen siendo
      // inventario que entro: esconderlas dejaria el saldo de esa subreceta corto para siempre.
      pushSubreceta({
        ...comun,
        articuloId: output.recipeId,
        qtyDelta: Number(output.qty ?? output.portions ?? 0),
      });
    }
  }

  for (const entry of producciones) {
    // La subreceta producida ENTRA al inventario. Esto faltaba por completo: se descontaban los
    // insumos y lo producido no aparecia en ningun lado, asi que una salsa solo podia salir.
    if (!filtroProducto) {
      pushSubreceta({
        id: `prodin-${entry.id}`,
        dateValue: entry.date.getTime(),
        dateLabel: dateLabelOf(entry.date),
        timeLabel: timeLabelOf(entry.createdAt),
        createdAtValue: entry.createdAt.getTime(),
        articuloId: entry.subRecipeId,
        type: "produccion_entrada",
        reference: "",
        detail: entry.comment ?? "",
        qtyDelta: Number(entry.quantity),
        userName: userLabel(entry.createdBy),
        href: "/production",
      });
    }

    const usage = safeUsage(entry.subRecipeId, graph);
    if (!usage) continue;
    const comun = {
      dateValue: entry.date.getTime(),
      dateLabel: dateLabelOf(entry.date),
      timeLabel: timeLabelOf(entry.createdAt),
      createdAtValue: entry.createdAt.getTime(),
      type: "produccion_salida" as const,
      reference: "",
      detail: `${Number(entry.quantity).toLocaleString("es-MX")} x ${entry.subRecipe.name}`,
      userName: userLabel(entry.createdBy),
      href: "/production",
    };
    for (const [usedProductId, perUnit] of usage.products) {
      if (filtroSubreceta || (filtroProducto && usedProductId !== filtroProducto)) continue;
      if (perUnit.isZero()) continue;
      pushProducto({
        ...comun,
        id: `prod-${entry.id}-${usedProductId}`,
        articuloId: usedProductId,
        qtyDelta: -perUnit.times(entry.quantity).toNumber(),
      });
    }
    // Una subreceta hecha con otra subreceta descuenta esa otra. Mismo criterio de un solo
    // nivel que ya usaban los productos: lo de mas abajo salio cuando se produjo.
    for (const [usedSubId, perUnit] of usage.subRecipes) {
      if (filtroProducto || (filtroSubreceta && usedSubId !== filtroSubreceta)) continue;
      if (perUnit.isZero()) continue;
      pushSubreceta({
        ...comun,
        id: `prodsub-${entry.id}-${usedSubId}`,
        articuloId: usedSubId,
        qtyDelta: -perUnit.times(entry.quantity).toNumber(),
      });
    }
  }

  // Las ventas se juntan por articulo y por dia: un dia son cientos de platillos y cada uno
  // toca varios articulos, asi que renglon por platillo volveria el kardex ilegible. El detalle
  // por platillo vive en la venta de ese dia.
  type VentaAgg = {
    qty: Decimal;
    platillos: Decimal;
    tipo: "producto" | "subreceta";
    articuloId: string;
    date: Date;
    createdAt: Date;
    usuarios: Set<string>;
  };
  const ventasPorArticuloYDia = new Map<string, VentaAgg>();
  const acumularVenta = (
    tipo: "producto" | "subreceta",
    id: string,
    cantidad: Decimal,
    sale: (typeof sales)[number],
  ) => {
    const key = `${tipo}:${id}:${sale.date.getTime()}`;
    const actual = ventasPorArticuloYDia.get(key) ?? {
      qty: new Decimal(0),
      platillos: new Decimal(0),
      tipo,
      articuloId: id,
      date: sale.date,
      createdAt: sale.createdAt,
      usuarios: new Set<string>(),
    };
    actual.qty = actual.qty.plus(cantidad);
    actual.platillos = actual.platillos.plus(sale.quantitySold);
    if (sale.createdAt > actual.createdAt) actual.createdAt = sale.createdAt;
    const usuario = userLabel(sale.createdBy);
    if (usuario) actual.usuarios.add(usuario);
    ventasPorArticuloYDia.set(key, actual);
  };

  for (const sale of sales) {
    const usage = safeUsage(sale.recipeId, graph);
    if (!usage) continue;
    for (const [usedProductId, perUnit] of usage.products) {
      if (filtroSubreceta || (filtroProducto && usedProductId !== filtroProducto)) continue;
      if (perUnit.isZero()) continue;
      acumularVenta("producto", usedProductId, perUnit.times(sale.quantitySold), sale);
    }
    // Vender un platillo que lleva salsa descuenta la salsa. Antes solo bajaban los productos
    // del platillo y la salsa se quedaba en el inventario para siempre.
    for (const [usedSubId, perUnit] of usage.subRecipes) {
      if (filtroProducto || (filtroSubreceta && usedSubId !== filtroSubreceta)) continue;
      if (perUnit.isZero()) continue;
      acumularVenta("subreceta", usedSubId, perUnit.times(sale.quantitySold), sale);
    }
  }

  for (const [key, venta] of ventasPorArticuloYDia) {
    const fila = {
      id: `venta-${key}`,
      dateValue: venta.date.getTime(),
      dateLabel: dateLabelOf(venta.date),
      timeLabel: timeLabelOf(venta.createdAt),
      createdAtValue: venta.createdAt.getTime(),
      articuloId: venta.articuloId,
      type: "venta" as const,
      reference: "",
      detail: `${venta.platillos.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} platillos vendidos`,
      qtyDelta: -venta.qty.toNumber(),
      userName:
        venta.usuarios.size === 1 ? [...venta.usuarios][0] : venta.usuarios.size > 1 ? "Varios" : null,
      href: "/sales",
    };
    if (venta.tipo === "producto") pushProducto(fila);
    else pushSubreceta(fila);
  }

  rows.sort(
    (a, b) =>
      a.dateValue - b.dateValue ||
      a.createdAtValue - b.createdAtValue ||
      a.articuloNombre.localeCompare(b.articuloNombre),
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
      const texto = [row.articuloNombre, row.reference, row.detail, row.userName ?? "", row.typeLabel]
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
 * Con cuanto empezo el periodo un articulo (producto o subreceta).
 *
 * Se parte del ultimo conteo fisico anterior a la fecha inicial y se le suman los movimientos
 * que hubo entre ese conteo y el inicio del periodo. Si nunca se ha contado, se arrastra todo
 * desde el primer movimiento registrado, y se dice, porque ese numero vale mucho menos.
 */
export async function computeKardexOpening(
  organizationId: string,
  sucursalId: string,
  articuloId: string,
  dateFrom: string,
): Promise<KardexOpening> {
  if (!dateFrom) return { qty: 0, basisLabel: "Sin fecha inicial" };
  const inicio = new Date(`${dateFrom}T00:00:00.000Z`);

  const conteo = await prisma.inventoryCount.findFirst({
    where: { sucursalId, date: { lt: inicio } },
    orderBy: { date: "desc" },
    // El conteo guarda productos y subrecetas en la misma tabla: el renglon es el que apunte
    // a este articulo, por el lado que sea.
    include: {
      items: { where: { OR: [{ productId: articuloId }, { subRecipeId: articuloId }] } },
    },
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
    articuloId,
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

/**
 * Inventario teorico de TODOS los productos a una fecha.
 *
 * Es el mismo razonamiento que computeKardexOpening pero para el catalogo entero: se parte del
 * ultimo conteo fisico hasta esa fecha y se le suman los movimientos posteriores. No sustituye
 * a un conteo —es lo que el sistema cree que hay, no lo que hay—, y esa es justo su utilidad:
 * comparado contra un conteo real, la diferencia es la merma que nadie registro.
 *
 * Los movimientos del mismo dia del conteo ya estan dentro de lo contado, asi que se arranca
 * del dia siguiente. Es el mismo corte que usa el resto de la app.
 */
export async function computeInventarioAlCorte(
  organizationId: string,
  sucursalId: string,
  fecha: string,
): Promise<InventarioAlCorte> {
  const corte = new Date(`${fecha}T00:00:00.000Z`);

  const [conteo, productos, subrecetas, graph] = await Promise.all([
    prisma.inventoryCount.findFirst({
      where: { sucursalId, date: { lte: corte } },
      orderBy: { date: "desc" },
      include: { items: true },
    }),
    prisma.product.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
    // Las subrecetas tienen inventario propio y se cuentan igual que un producto. Las que son
    // platillo de menu no: un PLU no se almacena, se arma al momento de servirlo.
    prisma.recipe.findMany({
      where: { sucursalId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, yieldUnit: true, yieldQty: true },
    }),
    loadOrgRecipeGraph(sucursalId),
  ]);

  // Las claves llevan prefijo porque un id de producto y uno de subreceta viven en el mismo
  // mapa y nada garantiza que no choquen.
  const clave = (tipo: ArticuloTipo, id: string) => `${tipo}:${id}`;

  const base = new Map<string, number>();
  if (conteo) {
    for (const item of conteo.items) {
      if (item.productId) base.set(clave("producto", item.productId), Number(item.quantity));
      else if (item.subRecipeId) {
        base.set(clave("subreceta", item.subRecipeId), Number(item.quantity));
      }
    }
  }

  const desde = conteo
    ? new Date(conteo.date.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "2000-01-01";

  // Si el conteo es posterior a la fecha de corte no puede pasar (se filtro con lte), pero el
  // dia siguiente si puede rebasarla: un conteo levantado justo el dia del corte no deja
  // movimientos que sumar.
  const movimientos =
    desde > fecha
      ? []
      : await loadKardexRows(organizationId, sucursalId, { dateFrom: desde, dateTo: fecha });

  const delta = new Map<string, number>();
  for (const row of movimientos) {
    const k = clave(row.articuloTipo, row.articuloId);
    delta.set(k, (delta.get(k) ?? 0) + row.qtyDelta);
  }

  const costos = await getSucursalProductCosts(
    sucursalId,
    productos.map((p) => p.id),
  );

  const rows: CorteRow[] = [];

  /** Un articulo que nunca se conto y nunca se movio no participa en este almacen. */
  const agregar = (
    tipo: ArticuloTipo,
    id: string,
    nombre: string,
    unitLabel: string,
    unitCost: number,
  ) => {
    const b = base.get(clave(tipo, id)) ?? 0;
    const m = delta.get(clave(tipo, id)) ?? 0;
    if (b === 0 && m === 0) return;
    const saldo = b + m;
    rows.push({
      articuloId: id,
      articuloTipo: tipo,
      articuloNombre: nombre,
      unitLabel,
      base: b,
      movimientos: m,
      saldo,
      unitCost,
      valor: saldo * unitCost,
    });
  };

  for (const producto of productos) {
    agregar(
      "producto",
      producto.id,
      producto.name,
      UNIT_LABELS[producto.baseUnit as UnitValue],
      costos.get(producto.id)?.toNumber() ?? 0,
    );
  }

  const memo = new Map<string, Decimal>();
  for (const receta of subrecetas) {
    // getRecipeCost devuelve el costo del RENDIMIENTO COMPLETO; el inventario se lleva por
    // unidad de ese rendimiento, asi que hay que dividir.
    let unitCost = 0;
    try {
      const yieldQty = new Decimal(receta.yieldQty);
      unitCost = yieldQty.isZero()
        ? 0
        : getRecipeCost(receta.id, graph, memo).dividedBy(yieldQty).toNumber();
    } catch {
      unitCost = 0;
    }
    agregar(
      "subreceta",
      receta.id,
      receta.name,
      UNIT_LABELS[receta.yieldUnit as UnitValue],
      unitCost,
    );
  }

  rows.sort((a, b) => a.articuloNombre.localeCompare(b.articuloNombre, "es"));

  return {
    rows,
    basisLabel: conteo
      ? `Conteo del ${conteo.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}`
      : "Sin conteo previo: arrastrado desde el primer movimiento",
    sinConteo: !conteo,
    totalValor: rows.reduce((suma, r) => suma + r.valor, 0),
  };
}
