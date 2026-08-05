import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";
import ProductionTable, { type ProductionRow } from "./ProductionTable";

export default async function ProductionPage() {
  const user = await requireSucursalContext();

  const entries = await prisma.productionEntry.findMany({
    where: { sucursalId: user.sucursalId },
    orderBy: { date: "desc" },
    take: 200,
    include: { subRecipe: { include: { category: true } } },
  });

  const rows: ProductionRow[] = entries.map((entry) => ({
    id: entry.id,
    dateLabel: entry.date.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    dateValue: entry.date.getTime(),
    subRecipeName: entry.subRecipe.name,
    categoryName: entry.subRecipe.category?.name ?? null,
    quantityLabel: Number(entry.quantity).toLocaleString("es-MX", { maximumFractionDigits: 4 }),
    quantityValue: Number(entry.quantity),
    unitLabel: UNIT_LABELS[entry.unit as UnitValue],
    unitCostLabel: `${formatMoney(Number(entry.unitCost), 4)} / ${UNIT_LABELS[entry.unit as UnitValue]}`,
    unitCostValue: Number(entry.unitCost),
    total: Number(entry.quantity) * Number(entry.unitCost),
    comment: entry.comment,
  }));

  const categoryNames = [...new Set(rows.map((r) => r.categoryName).filter((n): n is string => !!n))].sort(
    (a, b) => a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Produccion</h1>
        <Link
          href="/production/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Registrar produccion
        </Link>
      </div>

      <ProductionTable rows={rows} categoryNames={categoryNames} />
    </div>
  );
}
