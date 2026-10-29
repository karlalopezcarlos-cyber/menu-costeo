import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import {
  buildInventoryCountTemplateWorkbook,
  type CountTemplateRow,
} from "@/lib/excel/export-inventory-count-template";

export async function GET() {
  const user = await requireSucursalContext();

  const [products, subRecipes] = await Promise.all([
    prisma.product.findMany({
      where: {
        organizationId: user.organizationId,
        archivedAt: null,
        OR: [
          // Sin categoria se cuenta: no hay forma de saber que no se inventaria.
          { categoryId: null },
          { category: { isInventoriable: true, isExpense: false } },
        ],
      },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } }, presentations: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null, isMenuItem: false },
      orderBy: { name: "asc" },
      include: { category: { select: { name: true } } },
    }),
  ]);

  const rows: CountTemplateRow[] = [
    ...products.map((product) => {
      const presentaciones = [
        ...(product.presentationUnitLabel && product.presentationUnitQty
          ? [
              `${product.presentationUnitLabel} = ${Number(product.presentationUnitQty)} ${
                UNIT_LABELS[product.baseUnit as UnitValue]
              }`,
            ]
          : []),
        ...product.presentations.map(
          (p) => `${p.label} = ${Number(p.quantity)} ${UNIT_LABELS[p.unit as UnitValue]}`,
        ),
      ];
      return {
        categoryName: product.category?.name ?? null,
        type: "Producto" as const,
        name: product.name,
        presentationLabel: presentaciones.join("  -  "),
        unitLabel: UNIT_LABELS[product.baseUnit as UnitValue],
      };
    }),
    ...subRecipes.map((recipe) => ({
      categoryName: recipe.category?.name ?? null,
      type: "Subreceta" as const,
      name: recipe.name,
      presentationLabel: "",
      unitLabel: UNIT_LABELS[recipe.yieldUnit as UnitValue],
    })),
  ].sort(
    (a, b) =>
      (a.categoryName ?? "zzz").localeCompare(b.categoryName ?? "zzz", "es") ||
      a.name.localeCompare(b.name, "es"),
  );

  const buffer = await buildInventoryCountTemplateWorkbook(rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="formato-conteo-inventario.xlsx"`,
    },
  });
}
