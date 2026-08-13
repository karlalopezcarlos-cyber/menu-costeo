import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import PrintButton from "./PrintButton";

export default async function RecipeExecutePage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ qty?: string }>;
}) {
  const user = await requireSucursalContext();
  const { recipeId } = await params;
  const { qty } = await searchParams;

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { product: { include: { category: true } }, subRecipe: { select: { name: true } } },
      },
    },
  });
  if (!recipe) notFound();

  const yieldQty = new Decimal(recipe.yieldQty);
  const yieldUnitLabel = UNIT_LABELS[recipe.yieldUnit as UnitValue];

  const targetQty = qty ? new Decimal(qty || "0") : yieldQty;
  const scale = yieldQty.isZero() || targetQty.lte(0) ? new Decimal(1) : targetQty.dividedBy(yieldQty);

  const rows = recipe.items.map((item) => {
    const scaledQty = new Decimal(item.quantity).times(scale);
    return {
      id: item.id,
      name: item.product?.name ?? item.subRecipe?.name ?? "?",
      categoryName: item.product?.category?.name ?? null,
      isSubRecipe: !!item.subRecipeId,
      quantityLabel: scaledQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 3 }),
      unitLabel: UNIT_LABELS[item.unit as UnitValue],
    };
  });

  return (
    <div className="max-w-3xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-neutral-500 hover:underline">
          ← Volver a la receta
        </Link>
        <PrintButton />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-neutral-900">{recipe.name}</h1>
        <p className="text-sm text-neutral-500">
          Vas a preparar: <strong className="text-neutral-900">{targetQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} {yieldUnitLabel}</strong>
          {" "}(la receta base rinde {yieldQty.toNumber().toLocaleString("es-MX", { maximumFractionDigits: 2 })} {yieldUnitLabel})
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Categoria</th>
              <th className="px-4 py-2 font-medium">Ingrediente</th>
              <th className="px-4 py-2 font-medium">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Esta receta todavia no tiene ingredientes capturados.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                <td className="px-4 py-2">
                  {row.name}
                  {row.isSubRecipe && (
                    <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
                      Subreceta (ya preparada)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 font-medium">
                  {row.quantityLabel} {row.unitLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recipe.instructions && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-medium text-neutral-700">Procedimiento</h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">{recipe.instructions}</p>
        </div>
      )}
    </div>
  );
}
