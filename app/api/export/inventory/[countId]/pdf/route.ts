import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { buildInventoryCountPdf, type InventoryCountPdfRow } from "@/lib/pdf/export-inventory-count";

export async function GET(_request: Request, { params }: { params: Promise<{ countId: string }> }) {
  const user = await requireSucursalContext();
  const { countId } = await params;

  const [count, organization] = await Promise.all([
    prisma.inventoryCount.findFirst({
      where: { id: countId, sucursalId: user.sucursalId },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
            subRecipe: { include: { category: true } },
          },
        },
      },
    }),
    prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
  ]);
  if (!count) {
    return new NextResponse("Conteo no encontrado", { status: 404 });
  }

  const rows: InventoryCountPdfRow[] = count.items
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => {
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      if (item.product) {
        return {
          categoryName: item.product.category?.name ?? null,
          type: "Producto" as const,
          name: item.product.name,
          unitLabel: UNIT_LABELS[item.unit as UnitValue],
          quantity,
          unitCost,
          total: quantity * unitCost,
        };
      }
      return {
        categoryName: item.subRecipe?.category?.name ?? null,
        type: "Subreceta" as const,
        name: item.subRecipe?.name ?? "?",
        unitLabel: UNIT_LABELS[item.unit as UnitValue],
        quantity,
        unitCost,
        total: quantity * unitCost,
      };
    })
    .sort(
      (a, b) =>
        (a.categoryName ?? "").localeCompare(b.categoryName ?? "") || a.name.localeCompare(b.name),
    );

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const dateLabel = count.date.toLocaleDateString("es-MX", { timeZone: "UTC" });

  const buffer = await buildInventoryCountPdf({
    organizationName: organization?.name ?? "",
    dateLabel,
    rows,
    grandTotal,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="conteo-inventario-${dateLabel.replace(/\//g, "-")}.pdf"`,
    },
  });
}
