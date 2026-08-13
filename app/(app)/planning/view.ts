import Decimal from "decimal.js";
import { UNIT_LABELS, removeYieldFactor, type UnitValue } from "@/lib/units";
import { suggestPresentationLabel } from "@/lib/orders/quantity-label";
import { formatMoney } from "@/lib/format";
import type { PresentationOption } from "../_components/PresentationQuantityInput";

export type ProductionResultRow = {
  itemId: string;
  subRecipeId: string;
  name: string;
  unitLabel: string;
  grossQtyLabel: string;
  onHandQtyLabel: string;
  netQty: string;
  estimatedCost: number;
  comment: string;
  completed: boolean;
};

export type PurchaseResultRow = {
  itemId: string;
  productId: string;
  name: string;
  categoryName: string | null;
  baseUnit: UnitValue;
  unitLabel: string;
  grossQtyLabel: string;
  onHandQtyLabel: string;
  netQty: string;
  suggestedPresentationLabel: string | null;
  presentations: PresentationOption[];
  estimatedCost: number;
  comment: string;
  completed: boolean;
};

export type PlanningRunView = {
  id: string;
  createdAtLabel: string;
  targets: { recipeId: string; quantity: string }[];
  productionNeeds: ProductionResultRow[];
  purchaseNeeds: PurchaseResultRow[];
  totalProductionCostLabel: string;
  totalPurchaseCostLabel: string;
};

export type PlanningCosts = {
  /** productId -> costo unitario vigente en esta sucursal (ver getSucursalProductCosts). */
  productCosts: Map<string, Decimal>;
  /** subRecipeId -> costo por unidad de rendimiento (getRecipeCost dividido entre yieldQty). */
  subRecipeCosts: Map<string, Decimal>;
};

function fmtQty(n: Decimal.Value): string {
  return new Decimal(n).toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

/** Include de Prisma compartido entre la lectura inicial (page.tsx) y la relectura tras crear un run. */
export const PLANNING_RUN_INCLUDE = {
  items: {
    include: {
      product: { include: { category: true, presentations: true } },
      subRecipe: { select: { name: true, yieldUnit: true } },
    },
  },
} as const;

type PlanningRunItemWithRelations = {
  id: string;
  itemType: string;
  productId: string | null;
  subRecipeId: string | null;
  grossQty: Decimal;
  onHandQty: Decimal;
  netQty: Decimal;
  comment: string | null;
  completed: boolean;
  sortOrder: number;
  product: {
    name: string;
    baseUnit: string;
    yieldPercentage: Decimal;
    presentationUnitLabel: string | null;
    presentationUnitQty: Decimal | null;
    category: { name: string } | null;
    presentations: { id: string; label: string; quantity: Decimal; unit: string }[];
  } | null;
  subRecipe: { name: string; yieldUnit: string } | null;
};

export type PlanningRunWithItems = {
  id: string;
  createdAt: Date;
  targetsJson: string;
  items: PlanningRunItemWithRelations[];
};

/** Convierte el PlanningRun crudo de Prisma (con items+relaciones) en la forma que consume la UI. */
export function toPlanningRunView(run: PlanningRunWithItems, costs: PlanningCosts): PlanningRunView {
  let targets: { recipeId: string; quantity: string }[] = [];
  try {
    const parsed = JSON.parse(run.targetsJson);
    if (Array.isArray(parsed)) targets = parsed;
  } catch {
    targets = [];
  }

  const sortedItems = [...run.items].sort((a, b) => a.sortOrder - b.sortOrder);

  let totalProductionCost = new Decimal(0);
  const productionNeeds: ProductionResultRow[] = sortedItems
    .filter((i) => i.itemType === "production" && i.subRecipe)
    .map((i) => {
      const unitLabel = UNIT_LABELS[i.subRecipe!.yieldUnit as UnitValue];
      const unitCost = costs.subRecipeCosts.get(i.subRecipeId!) ?? new Decimal(0);
      const estimatedCost = unitCost.times(i.netQty);
      totalProductionCost = totalProductionCost.plus(estimatedCost);
      return {
        itemId: i.id,
        subRecipeId: i.subRecipeId!,
        name: i.subRecipe!.name,
        unitLabel,
        grossQtyLabel: `${fmtQty(i.grossQty)} ${unitLabel}`,
        onHandQtyLabel: `${fmtQty(i.onHandQty)} ${unitLabel}`,
        netQty: i.netQty.toString(),
        estimatedCost: estimatedCost.toNumber(),
        comment: i.comment ?? "",
        completed: i.completed,
      };
    });

  let totalPurchaseCost = new Decimal(0);
  const purchaseNeeds: PurchaseResultRow[] = sortedItems
    .filter((i) => i.itemType === "purchase" && i.product)
    .map((i) => {
      const product = i.product!;
      const baseUnit = product.baseUnit as UnitValue;
      const unitLabel = UNIT_LABELS[baseUnit];
      const presentations: PresentationOption[] = [
        ...(product.presentationUnitLabel && product.presentationUnitQty
          ? [
              {
                id: "legacy",
                label: product.presentationUnitLabel,
                quantity: product.presentationUnitQty.toString(),
                unit: baseUnit,
              },
            ]
          : []),
        ...product.presentations.map((p) => ({
          id: p.id,
          label: p.label,
          quantity: p.quantity.toString(),
          unit: p.unit as UnitValue,
        })),
      ];
      // netQty ya viene en cantidad BRUTA de compra (ver runPlanning), asi que el costo se calcula
      // con el costo BRUTO por kg (de compra), no el neto ya ajustado por rendimiento -- de lo
      // contrario se contaria el rendimiento dos veces y el presupuesto saldria inflado.
      const netUnitCost = costs.productCosts.get(i.productId!) ?? new Decimal(0);
      const yieldPercentage = Number(product.yieldPercentage);
      const unitCost = yieldPercentage !== 100 ? removeYieldFactor(netUnitCost, yieldPercentage) : netUnitCost;
      const estimatedCost = unitCost.times(i.netQty);
      totalPurchaseCost = totalPurchaseCost.plus(estimatedCost);
      return {
        itemId: i.id,
        productId: i.productId!,
        name: product.name,
        categoryName: product.category?.name ?? null,
        baseUnit,
        unitLabel,
        grossQtyLabel: `${fmtQty(i.grossQty)} ${unitLabel}`,
        onHandQtyLabel: `${fmtQty(i.onHandQty)} ${unitLabel}`,
        netQty: i.netQty.toString(),
        suggestedPresentationLabel: suggestPresentationLabel(i.netQty, {
          baseUnit,
          presentationUnitLabel: product.presentationUnitLabel,
          presentationUnitQty: product.presentationUnitQty,
          presentations: product.presentations,
        }),
        presentations,
        estimatedCost: estimatedCost.toNumber(),
        comment: i.comment ?? "",
        completed: i.completed,
      };
    });

  return {
    id: run.id,
    createdAtLabel: run.createdAt.toLocaleString("es-MX", { timeZone: "UTC" }),
    targets,
    productionNeeds,
    purchaseNeeds,
    totalProductionCostLabel: formatMoney(totalProductionCost.toNumber()),
    totalPurchaseCostLabel: formatMoney(totalPurchaseCost.toNumber()),
  };
}
