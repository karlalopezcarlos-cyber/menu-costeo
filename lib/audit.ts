import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { loadOrgRecipeGraph, getRecipeCost, getRecipeUsagePerUnit, type RecipeGraph, type RecipeUsage } from "@/lib/costing";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { sumVarianceAmounts } from "@/lib/audit-filters";

export { filterAuditRows, sumVarianceAmounts, type AuditRowFilters } from "@/lib/audit-filters";

export type ItemType = "product" | "subrecipe";

export type AuditRow = {
  itemId: string;
  itemType: ItemType;
  name: string;
  categoryName: string | null;
  unitLabel: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: number | null;
  initialQty: number;
  purchasesQty: number;
  producedQty: number;
  wasteQty: number;
  productionConsumedQty: number;
  salesQty: number;
  theoreticalFinalQty: number;
  actualFinalQty: number | null;
  varianceQty: number | null;
  variancePct: number | null;
  varianceAmount: number | null;
  previousVarianceQty: number | null;
  comment: string | null;
};

export type AuditResult = {
  initialDateLabel: string;
  finalDateLabel: string | null;
  finalCountId: string | null;
  rows: AuditRow[];
  totalShortageAmount: number;
  totalSurplusAmount: number;
};

function toDecimalMap(entries: { key: string; quantity: Decimal | number }[]): Map<string, Decimal> {
  const map = new Map<string, Decimal>();
  for (const entry of entries) {
    const value = new Decimal(entry.quantity);
    map.set(entry.key, (map.get(entry.key) ?? new Decimal(0)).plus(value));
  }
  return map;
}

function mergeInto(target: Map<string, Decimal>, source: Map<string, Decimal>, factor: Decimal) {
  for (const [key, value] of source) {
    target.set(key, (target.get(key) ?? new Decimal(0)).plus(value.times(factor)));
  }
}

function safeUsage(recipeId: string, graph: RecipeGraph): RecipeUsage | null {
  try {
    return getRecipeUsagePerUnit(recipeId, graph);
  } catch {
    return null;
  }
}

/**
 * Reconciliacion teorica de inventario, en cantidades (no dinero), para productos Y subrecetas:
 * inicial (ultimo conteo) + compras (compras registradas directamente en /purchases + pedidos ya
 * recibidos en /orders, solo productos) + produccion (solo subrecetas) - mermas (solo productos)
 * - consumo por produccion de otras subrecetas - consumo por ventas = teorico. Si se da un conteo
 * final, se compara contra lo realmente contado.
 */
export async function computeInventoryAudit(
  organizationId: string,
  initialCountId: string,
  finalCountId: string | null,
  options: { includePreviousVariance?: boolean } = {},
): Promise<AuditResult> {
  const { includePreviousVariance = true } = options;
  const [initialCount, finalCount] = await Promise.all([
    prisma.inventoryCount.findFirst({
      where: { id: initialCountId, organizationId },
      include: { items: true },
    }),
    finalCountId
      ? prisma.inventoryCount.findFirst({
          where: { id: finalCountId, organizationId },
          include: { items: true },
        })
      : Promise.resolve(null),
  ]);
  if (!initialCount) throw new Error("Conteo inicial no encontrado.");

  const rangeStart = initialCount.date;
  const rangeEnd = finalCount?.date ?? null;
  const dateFilter = rangeEnd ? { gt: rangeStart, lte: rangeEnd } : { gt: rangeStart };

  const [products, subRecipes, purchases, purchaseOrderItems, wasteEntries, productionEntries, sales, graph, comments] =
    await Promise.all([
      prisma.product.findMany({
        where: { organizationId, archivedAt: null },
        orderBy: { name: "asc" },
        include: { category: true },
      }),
      prisma.recipe.findMany({
        where: { organizationId, archivedAt: null, isMenuItem: false },
        orderBy: { name: "asc" },
        include: { category: true },
      }),
      prisma.purchase.findMany({
        where: { organizationId, purchaseDate: dateFilter },
        select: { productId: true, presentationQty: true, presentationUnit: true },
      }),
      prisma.purchaseOrderItem.findMany({
        where: { purchaseOrder: { organizationId, status: "RECEIVED", receivedAt: dateFilter } },
        select: { productId: true, quantity: true },
      }),
      prisma.wasteEntry.findMany({
        where: { organizationId, date: dateFilter },
        select: { productId: true, quantity: true, unit: true },
      }),
      prisma.productionEntry.findMany({
        where: { organizationId, date: dateFilter },
        select: { subRecipeId: true, quantity: true },
      }),
      prisma.dailySale.findMany({
        where: { organizationId, date: dateFilter },
        select: { recipeId: true, quantitySold: true },
      }),
      loadOrgRecipeGraph(organizationId),
      finalCountId
        ? prisma.auditComment.findMany({ where: { organizationId, finalCountId } })
        : Promise.resolve([]),
    ]);

  const baseUnitByProductId = new Map(products.map((p) => [p.id, p.baseUnit as UnitValue]));

  const commentByKey = new Map(comments.map((c) => [c.productId ?? c.subRecipeId ?? "", c.comment]));
  const costMemo = new Map<string, Decimal>();

  const initialByKey = toDecimalMap(
    initialCount.items.map((i) => ({
      key: i.productId ?? i.subRecipeId ?? "",
      quantity: i.quantity,
    })).filter((e) => e.key),
  );
  const finalByKey = finalCount
    ? toDecimalMap(
        finalCount.items.map((i) => ({
          key: i.productId ?? i.subRecipeId ?? "",
          quantity: i.quantity,
        })).filter((e) => e.key),
      )
    : null;

  const purchasesByProductId = toDecimalMap(
    purchaseOrderItems.map((i) => ({ key: i.productId, quantity: i.quantity })),
  );
  for (const purchase of purchases) {
    const baseUnit = baseUnitByProductId.get(purchase.productId);
    if (!baseUnit) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(purchase.presentationQty, purchase.presentationUnit as UnitValue, baseUnit);
    } catch {
      continue;
    }
    purchasesByProductId.set(
      purchase.productId,
      (purchasesByProductId.get(purchase.productId) ?? new Decimal(0)).plus(qtyInBase),
    );
  }
  const wasteByProductId = new Map<string, Decimal>();
  for (const entry of wasteEntries) {
    const baseUnit = baseUnitByProductId.get(entry.productId);
    if (!baseUnit) continue;
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(entry.quantity, entry.unit as UnitValue, baseUnit);
    } catch {
      continue;
    }
    wasteByProductId.set(entry.productId, (wasteByProductId.get(entry.productId) ?? new Decimal(0)).plus(qtyInBase));
  }
  const producedBySubRecipeId = toDecimalMap(
    productionEntries.map((i) => ({ key: i.subRecipeId, quantity: i.quantity })),
  );

  const productionConsumedByProductId = new Map<string, Decimal>();
  const productionConsumedBySubRecipeId = new Map<string, Decimal>();
  for (const entry of productionEntries) {
    const usage = safeUsage(entry.subRecipeId, graph);
    if (!usage) continue;
    const qty = new Decimal(entry.quantity);
    mergeInto(productionConsumedByProductId, usage.products, qty);
    mergeInto(productionConsumedBySubRecipeId, usage.subRecipes, qty);
  }

  const salesConsumedByProductId = new Map<string, Decimal>();
  const salesConsumedBySubRecipeId = new Map<string, Decimal>();
  for (const sale of sales) {
    const usage = safeUsage(sale.recipeId, graph);
    if (!usage) continue;
    const qty = new Decimal(sale.quantitySold);
    mergeInto(salesConsumedByProductId, usage.products, qty);
    mergeInto(salesConsumedBySubRecipeId, usage.subRecipes, qty);
  }

  const productRows: AuditRow[] = products.map((product) => {
    const initialQty = initialByKey.get(product.id) ?? new Decimal(0);
    const purchasesQty = purchasesByProductId.get(product.id) ?? new Decimal(0);
    const wasteQty = wasteByProductId.get(product.id) ?? new Decimal(0);
    const productionConsumedQty = productionConsumedByProductId.get(product.id) ?? new Decimal(0);
    const salesQty = salesConsumedByProductId.get(product.id) ?? new Decimal(0);
    const theoreticalFinalQty = initialQty
      .plus(purchasesQty)
      .minus(wasteQty)
      .minus(productionConsumedQty)
      .minus(salesQty);
    const actualFinalQty = finalByKey ? finalByKey.get(product.id) ?? new Decimal(0) : null;
    const varianceQty = actualFinalQty !== null ? actualFinalQty.minus(theoreticalFinalQty) : null;
    const variancePct =
      varianceQty !== null && !theoreticalFinalQty.isZero()
        ? varianceQty.dividedBy(theoreticalFinalQty.abs()).times(100)
        : null;
    const unitCost = new Decimal(product.currentUnitCost);
    const varianceAmount = varianceQty !== null ? varianceQty.times(unitCost) : null;

    return {
      itemId: product.id,
      itemType: "product" as const,
      name: product.name,
      categoryName: product.category?.name ?? null,
      unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
      presentationUnitLabel: product.presentationUnitLabel,
      presentationUnitQty: product.presentationUnitQty ? Number(product.presentationUnitQty) : null,
      initialQty: initialQty.toNumber(),
      purchasesQty: purchasesQty.toNumber(),
      producedQty: 0,
      wasteQty: wasteQty.toNumber(),
      productionConsumedQty: productionConsumedQty.toNumber(),
      salesQty: salesQty.toNumber(),
      theoreticalFinalQty: theoreticalFinalQty.toNumber(),
      actualFinalQty: actualFinalQty !== null ? actualFinalQty.toNumber() : null,
      varianceQty: varianceQty !== null ? varianceQty.toNumber() : null,
      variancePct: variancePct !== null ? variancePct.toNumber() : null,
      varianceAmount: varianceAmount !== null ? varianceAmount.toNumber() : null,
      previousVarianceQty: null,
      comment: commentByKey.get(product.id) ?? null,
    };
  });

  const subRecipeRows: AuditRow[] = subRecipes.map((recipe) => {
    const initialQty = initialByKey.get(recipe.id) ?? new Decimal(0);
    const producedQty = producedBySubRecipeId.get(recipe.id) ?? new Decimal(0);
    const productionConsumedQty = productionConsumedBySubRecipeId.get(recipe.id) ?? new Decimal(0);
    const salesQty = salesConsumedBySubRecipeId.get(recipe.id) ?? new Decimal(0);
    const theoreticalFinalQty = initialQty.plus(producedQty).minus(productionConsumedQty).minus(salesQty);
    const actualFinalQty = finalByKey ? finalByKey.get(recipe.id) ?? new Decimal(0) : null;
    const varianceQty = actualFinalQty !== null ? actualFinalQty.minus(theoreticalFinalQty) : null;
    const variancePct =
      varianceQty !== null && !theoreticalFinalQty.isZero()
        ? varianceQty.dividedBy(theoreticalFinalQty.abs()).times(100)
        : null;

    let unitCost = new Decimal(0);
    if (!recipe.yieldQty.isZero()) {
      try {
        unitCost = getRecipeCost(recipe.id, graph, costMemo).dividedBy(recipe.yieldQty);
      } catch {
        unitCost = new Decimal(0);
      }
    }
    const varianceAmount = varianceQty !== null ? varianceQty.times(unitCost) : null;

    return {
      itemId: recipe.id,
      itemType: "subrecipe" as const,
      name: recipe.name,
      categoryName: recipe.category?.name ?? null,
      unitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
      presentationUnitLabel: null,
      presentationUnitQty: null,
      initialQty: initialQty.toNumber(),
      purchasesQty: 0,
      producedQty: producedQty.toNumber(),
      wasteQty: 0,
      productionConsumedQty: productionConsumedQty.toNumber(),
      salesQty: salesQty.toNumber(),
      theoreticalFinalQty: theoreticalFinalQty.toNumber(),
      actualFinalQty: actualFinalQty !== null ? actualFinalQty.toNumber() : null,
      varianceQty: varianceQty !== null ? varianceQty.toNumber() : null,
      variancePct: variancePct !== null ? variancePct.toNumber() : null,
      varianceAmount: varianceAmount !== null ? varianceAmount.toNumber() : null,
      previousVarianceQty: null,
      comment: commentByKey.get(recipe.id) ?? null,
    };
  });

  const rows = [...productRows, ...subRecipeRows];

  if (includePreviousVariance) {
    const priorCount = await prisma.inventoryCount.findFirst({
      where: { organizationId, date: { lt: initialCount.date } },
      orderBy: { date: "desc" },
      select: { id: true },
    });
    if (priorCount) {
      const priorResult = await computeInventoryAudit(organizationId, priorCount.id, initialCountId, {
        includePreviousVariance: false,
      });
      const priorVarianceByKey = new Map(priorResult.rows.map((r) => [`${r.itemType}:${r.itemId}`, r.varianceQty]));
      for (const row of rows) {
        row.previousVarianceQty = priorVarianceByKey.get(`${row.itemType}:${row.itemId}`) ?? null;
      }
    }
  }

  const { totalShortageAmount, totalSurplusAmount } = sumVarianceAmounts(rows);

  return {
    initialDateLabel: initialCount.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    finalDateLabel: finalCount ? finalCount.date.toLocaleDateString("es-MX", { timeZone: "UTC" }) : null,
    finalCountId: finalCount ? finalCount.id : null,
    rows,
    totalShortageAmount,
    totalSurplusAmount,
  };
}

export type KardexMovement = {
  date: Date;
  dateLabel: string;
  type: "compra" | "merma" | "venta" | "produccion_entrada" | "produccion_salida";
  label: string;
  qtyDelta: number;
  runningBalance: number;
  href: string | null;
};

export type ItemKardex = {
  itemName: string;
  categoryName: string | null;
  unitLabel: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: number | null;
  initialDateLabel: string;
  initialQty: number;
  finalDateLabel: string | null;
  theoreticalFinalQty: number;
  actualFinalQty: number | null;
  varianceQty: number | null;
  movements: KardexMovement[];
};

function dateLabel(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

/**
 * Detalle cronologico de todos los movimientos que la auditoria contemplo para un producto o
 * subreceta: cada compra recibida, cada merma, cada produccion (entrada si es la subreceta
 * producida, salida si se consumio como ingrediente de otra) y cada venta que lo consumio
 * (directo o via subreceta), con saldo corrido desde el inventario inicial hasta el teorico.
 */
export async function computeItemKardex(
  organizationId: string,
  itemType: ItemType,
  itemId: string,
  initialCountId: string,
  finalCountId: string | null,
): Promise<ItemKardex> {
  const [item, initialCount, finalCount] = await Promise.all([
    itemType === "product"
      ? prisma.product.findFirst({ where: { id: itemId, organizationId }, include: { category: true } })
      : prisma.recipe.findFirst({ where: { id: itemId, organizationId }, include: { category: true } }),
    prisma.inventoryCount.findFirst({
      where: { id: initialCountId, organizationId },
      include: { items: true },
    }),
    finalCountId
      ? prisma.inventoryCount.findFirst({
          where: { id: finalCountId, organizationId },
          include: { items: true },
        })
      : Promise.resolve(null),
  ]);
  if (!item) throw new Error(itemType === "product" ? "Producto no encontrado." : "Subreceta no encontrada.");
  if (!initialCount) throw new Error("Conteo inicial no encontrado.");

  const unitLabel =
    itemType === "product"
      ? UNIT_LABELS[(item as { baseUnit: UnitValue }).baseUnit]
      : UNIT_LABELS[(item as { yieldUnit: UnitValue }).yieldUnit];
  const presentationUnitLabel =
    itemType === "product" ? (item as { presentationUnitLabel: string | null }).presentationUnitLabel : null;
  const presentationUnitQtyRaw =
    itemType === "product" ? (item as { presentationUnitQty: Decimal | null }).presentationUnitQty : null;
  const presentationUnitQty = presentationUnitQtyRaw ? Number(presentationUnitQtyRaw) : null;

  const rangeStart = initialCount.date;
  const rangeEnd = finalCount?.date ?? null;
  const dateFilter = rangeEnd ? { gt: rangeStart, lte: rangeEnd } : { gt: rangeStart };

  const [purchases, purchaseOrderItems, wasteEntries, ownProduction, allProduction, sales, graph] = await Promise.all([
    itemType === "product"
      ? prisma.purchase.findMany({
          where: { organizationId, productId: itemId, purchaseDate: dateFilter },
          include: { supplier: true },
        })
      : Promise.resolve([]),
    itemType === "product"
      ? prisma.purchaseOrderItem.findMany({
          where: { productId: itemId, purchaseOrder: { organizationId, status: "RECEIVED", receivedAt: dateFilter } },
          include: { purchaseOrder: { include: { supplier: true } } },
        })
      : Promise.resolve([]),
    itemType === "product"
      ? prisma.wasteEntry.findMany({ where: { organizationId, productId: itemId, date: dateFilter } })
      : Promise.resolve([]),
    itemType === "subrecipe"
      ? prisma.productionEntry.findMany({ where: { organizationId, subRecipeId: itemId, date: dateFilter } })
      : Promise.resolve([]),
    prisma.productionEntry.findMany({
      where: { organizationId, date: dateFilter },
      include: { subRecipe: { select: { name: true } } },
    }),
    prisma.dailySale.findMany({
      where: { organizationId, date: dateFilter },
      include: { recipe: { select: { name: true } } },
    }),
    loadOrgRecipeGraph(organizationId),
  ]);

  const movements: (KardexMovement & { sortIndex: number })[] = [];

  purchases.forEach((purchase, index) => {
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(
        purchase.presentationQty,
        purchase.presentationUnit as UnitValue,
        (item as { baseUnit: UnitValue }).baseUnit,
      );
    } catch {
      return;
    }
    movements.push({
      date: purchase.purchaseDate,
      dateLabel: dateLabel(purchase.purchaseDate),
      type: "compra",
      label: `Compra${purchase.supplier ? ` - ${purchase.supplier.name}` : ""} (${purchase.presentationLabel})`,
      qtyDelta: qtyInBase.toNumber(),
      runningBalance: 0,
      href: "/purchases",
      sortIndex: index,
    });
  });

  purchaseOrderItems.forEach((purchaseItem, index) => {
    const date = purchaseItem.purchaseOrder.receivedAt ?? purchaseItem.purchaseOrder.createdAt;
    movements.push({
      date,
      dateLabel: dateLabel(date),
      type: "compra",
      label: `Compra recibida${purchaseItem.purchaseOrder.supplier ? ` - ${purchaseItem.purchaseOrder.supplier.name}` : ""} (${purchaseItem.presentationLabel})`,
      qtyDelta: Number(purchaseItem.quantity),
      runningBalance: 0,
      href: `/orders/${purchaseItem.purchaseOrderId}`,
      sortIndex: 500 + index,
    });
  });

  wasteEntries.forEach((entry, index) => {
    let qtyInBase: Decimal;
    try {
      qtyInBase = convertQty(entry.quantity, entry.unit as UnitValue, (item as { baseUnit: UnitValue }).baseUnit);
    } catch {
      return;
    }
    movements.push({
      date: entry.date,
      dateLabel: dateLabel(entry.date),
      type: "merma",
      label: entry.comment ? `Merma - ${entry.comment}` : "Merma",
      qtyDelta: -qtyInBase.toNumber(),
      runningBalance: 0,
      href: "/waste",
      sortIndex: 1000 + index,
    });
  });

  ownProduction.forEach((entry, index) => {
    movements.push({
      date: entry.date,
      dateLabel: dateLabel(entry.date),
      type: "produccion_entrada",
      label: entry.comment ? `Produccion - ${entry.comment}` : "Produccion",
      qtyDelta: Number(entry.quantity),
      runningBalance: 0,
      href: "/production",
      sortIndex: 2000 + index,
    });
  });

  allProduction.forEach((entry, index) => {
    if (entry.subRecipeId === itemId) return;
    const usage = safeUsage(entry.subRecipeId, graph);
    if (!usage) return;
    const perUnit = itemType === "product" ? usage.products.get(itemId) : usage.subRecipes.get(itemId);
    if (!perUnit || perUnit.isZero()) return;
    const consumed = perUnit.times(entry.quantity);
    movements.push({
      date: entry.date,
      dateLabel: dateLabel(entry.date),
      type: "produccion_salida",
      label: `Produccion: ${Number(entry.quantity)} x ${entry.subRecipe.name} (consumo)`,
      qtyDelta: -consumed.toNumber(),
      runningBalance: 0,
      href: "/production",
      sortIndex: 3000 + index,
    });
  });

  sales.forEach((sale, index) => {
    const usage = safeUsage(sale.recipeId, graph);
    if (!usage) return;
    const perUnit = itemType === "product" ? usage.products.get(itemId) : usage.subRecipes.get(itemId);
    if (!perUnit || perUnit.isZero()) return;
    const consumed = perUnit.times(sale.quantitySold);
    movements.push({
      date: sale.date,
      dateLabel: dateLabel(sale.date),
      type: "venta",
      label: `Venta: ${Number(sale.quantitySold)} x ${sale.recipe.name}`,
      qtyDelta: -consumed.toNumber(),
      runningBalance: 0,
      href: `/recipes/${sale.recipeId}`,
      sortIndex: 4000 + index,
    });
  });

  movements.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sortIndex - b.sortIndex);

  const initialItem = initialCount.items.find((i) =>
    itemType === "product" ? i.productId === itemId : i.subRecipeId === itemId,
  );
  const initialQty = initialItem ? Number(initialItem.quantity) : 0;

  let running = initialQty;
  for (const movement of movements) {
    running += movement.qtyDelta;
    movement.runningBalance = running;
  }

  const finalItem = finalCount?.items.find((i) =>
    itemType === "product" ? i.productId === itemId : i.subRecipeId === itemId,
  );
  const actualFinalQty = finalCount ? (finalItem ? Number(finalItem.quantity) : 0) : null;
  const varianceQty = actualFinalQty !== null ? actualFinalQty - running : null;

  return {
    itemName: item.name,
    categoryName: item.category?.name ?? null,
    unitLabel,
    presentationUnitLabel,
    presentationUnitQty,
    initialDateLabel: dateLabel(initialCount.date),
    initialQty,
    finalDateLabel: finalCount ? dateLabel(finalCount.date) : null,
    theoreticalFinalQty: running,
    actualFinalQty,
    varianceQty,
    movements: movements.map(({ sortIndex: _sortIndex, ...m }) => m),
  };
}
