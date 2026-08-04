import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { removeYieldFactor, UNIT_LABELS, type UnitValue } from "@/lib/units";
import InventoryCaptureTable, { type CaptureRow } from "./InventoryCaptureTable";
import InventoryCountTabs from "./InventoryCountTabs";
import InventoryChangeLogTable, { type ChangeLogRow } from "./InventoryChangeLogTable";

export default async function InventoryCountPage({
  params,
  searchParams,
}: {
  params: Promise<{ countId: string }>;
  searchParams: Promise<{ existing?: string }>;
}) {
  const { countId } = await params;
  const { existing } = await searchParams;
  const user = await requireOrgSession();

  const [count, changes] = await Promise.all([
    prisma.inventoryCount.findFirst({
      where: { id: countId, organizationId: user.organizationId },
      include: { items: true },
    }),
    prisma.inventoryCountItemChange.findMany({
      where: { inventoryCount: { id: countId, organizationId: user.organizationId } },
      orderBy: { changedAt: "desc" },
      include: {
        product: { select: { name: true, baseUnit: true } },
        subRecipe: { select: { name: true, yieldUnit: true } },
        changedBy: { select: { name: true, email: true } },
      },
    }),
  ]);
  if (!count) notFound();

  const changeRows: ChangeLogRow[] = changes.map((c) => ({
    id: c.id,
    changedAtLabel: c.changedAt.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }),
    changedByName: c.changedBy?.name ?? c.changedBy?.email ?? null,
    itemName: c.product?.name ?? c.subRecipe?.name ?? "?",
    unitLabel: c.product
      ? UNIT_LABELS[c.product.baseUnit as UnitValue]
      : c.subRecipe
        ? UNIT_LABELS[c.subRecipe.yieldUnit as UnitValue]
        : "",
    previousQuantity: c.previousQuantity !== null ? Number(c.previousQuantity) : null,
    newQuantity: Number(c.newQuantity),
  }));

  const [products, subRecipes, graph] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      include: { category: true, presentations: true },
    }),
    prisma.recipe.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      include: { category: true },
    }),
    loadOrgRecipeGraph(user.organizationId),
  ]);

  const itemByProductId = new Map(
    count.items
      .filter((i) => i.productId)
      .map((i) => [i.productId as string, { quantity: Number(i.quantity), costBasis: i.costBasis }]),
  );
  const qtyBySubRecipeId = new Map(
    count.items.filter((i) => i.subRecipeId).map((i) => [i.subRecipeId as string, Number(i.quantity)]),
  );

  const memo = new Map<string, Decimal>();

  const rows: CaptureRow[] = [
    ...products.map((product) => {
      const existing = itemByProductId.get(product.id);
      const netUnitCost = new Decimal(product.currentUnitCost);
      const yieldPercentage = Number(product.yieldPercentage);
      const grossUnitCost =
        yieldPercentage !== 100 ? removeYieldFactor(netUnitCost, yieldPercentage) : netUnitCost;
      return {
        key: `product-${product.id}`,
        type: "Producto" as const,
        id: product.id,
        name: product.name,
        categoryName: product.category?.name ?? null,
        baseUnit: product.baseUnit as UnitValue,
        unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
        yieldPercentage,
        netUnitCost: netUnitCost.toNumber(),
        grossUnitCost: grossUnitCost.toNumber(),
        initialCostBasis: existing?.costBasis === "gross" ? ("gross" as const) : ("net" as const),
        initialQuantity: existing?.quantity ?? 0,
        presentations: [
          ...(product.presentationUnitLabel && product.presentationUnitQty
            ? [
                {
                  id: "legacy",
                  label: product.presentationUnitLabel,
                  quantity: product.presentationUnitQty.toString(),
                  unit: product.baseUnit as UnitValue,
                },
              ]
            : []),
          ...product.presentations.map((p) => ({
            id: p.id,
            label: p.label,
            quantity: p.quantity.toString(),
            unit: p.unit as UnitValue,
          })),
        ],
      };
    }),
    ...subRecipes.map((recipe) => {
      let unitCost = 0;
      const node = graph.recipes.get(recipe.id);
      if (node && !node.yieldQty.isZero()) {
        try {
          unitCost = getRecipeCost(recipe.id, graph, memo).dividedBy(node.yieldQty).toNumber();
        } catch {
          unitCost = 0;
        }
      }
      return {
        key: `subrecipe-${recipe.id}`,
        type: "Subreceta" as const,
        id: recipe.id,
        name: recipe.name,
        categoryName: recipe.category?.name ?? null,
        baseUnit: recipe.yieldUnit as UnitValue,
        unitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
        yieldPercentage: 100,
        netUnitCost: unitCost,
        grossUnitCost: unitCost,
        initialCostBasis: "net" as const,
        initialQuantity: qtyBySubRecipeId.get(recipe.id) ?? 0,
        presentations: [],
      };
    }),
  ];

  return (
    <div className="space-y-6">
      {existing === "1" && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Ya existia un conteo para esta fecha, no se puede crear otro. Este es el conteo existente.
        </p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Conteo de inventario - {count.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}
          </h1>
          <p className="text-sm text-neutral-500">
            Captura la cantidad contada de cada producto o subreceta y guarda.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/export/inventory/${count.id}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar a Excel
          </a>
          <a
            href={`/api/export/inventory/${count.id}/pdf`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar a PDF
          </a>
          <Link href="/inventory" className="text-sm text-neutral-500 hover:underline">
            Volver a inventario
          </Link>
        </div>
      </div>

      <InventoryCountTabs
        captureTable={<InventoryCaptureTable countId={count.id} rows={rows} />}
        changeLog={<InventoryChangeLogTable rows={changeRows} />}
        changeCount={changeRows.length}
      />
    </div>
  );
}
