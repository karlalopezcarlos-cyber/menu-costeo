import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { buildInventoryCountWorkbook, type InventoryCountExportRow } from "@/lib/excel/export-inventory-count";

export async function GET(_request: Request, { params }: { params: Promise<{ countId: string }> }) {
  const user = await requireSucursalContext();
  const { countId } = await params;

  const count = await prisma.inventoryCount.findFirst({
    where: { id: countId, sucursalId: user.sucursalId },
    include: {
      items: {
        include: {
          product: { include: { category: true } },
          subRecipe: { include: { category: true } },
        },
      },
    },
  });
  if (!count) {
    return new NextResponse("Conteo no encontrado", { status: 404 });
  }

  const rows: InventoryCountExportRow[] = count.items
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

  const dateLabel = count.date.toLocaleDateString("es-MX", { timeZone: "UTC" });
  const buffer = await buildInventoryCountWorkbook(dateLabel, rows);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="conteo-inventario-${dateLabel.replace(/\//g, "-")}.xlsx"`,
    },
  });
}
