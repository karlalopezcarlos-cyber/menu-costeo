import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { monthStartDateInputValue, todayDateInputValue } from "@/lib/date-inputs";
import { computeKardexOpening, filterKardexRows, loadKardexRows } from "@/lib/kardex";
import { readKardexFilters } from "@/lib/kardex-filters";
import { buildKardexWorkbook } from "@/lib/excel/export-kardex";

export async function GET(request: Request) {
  const user = await requireSucursalContext();
  const { searchParams } = new URL(request.url);
  const filters = readKardexFilters((key) => searchParams.get(key));

  // Sin periodo se exporta el mes en curso, igual que abre la pantalla.
  const dateFrom = filters.dateFrom || monthStartDateInputValue();
  const dateTo = filters.dateTo || todayDateInputValue();

  const rows = filterKardexRows(
    await loadKardexRows(user.organizationId, user.sucursalId, {
      articuloId: filters.articuloId || undefined,
      dateFrom,
      dateTo,
    }),
    filters,
  );

  // El saldo corrido solo tiene sentido con un articulo a la vez.
  let openingQty: number | null = null;
  let openingLabel: string | null = null;
  let productName: string | null = null;
  if (filters.articuloId) {
    // El id puede ser de un producto o de una subreceta; se busca en los dos lados.
    const [opening, product, subreceta] = await Promise.all([
      computeKardexOpening(user.organizationId, user.sucursalId, filters.articuloId, dateFrom),
      prisma.product.findFirst({
        where: { id: filters.articuloId, organizationId: user.organizationId },
        select: { name: true },
      }),
      prisma.recipe.findFirst({
        where: { id: filters.articuloId, sucursalId: user.sucursalId },
        select: { name: true },
      }),
    ]);
    openingQty = opening.qty;
    openingLabel = opening.basisLabel;
    productName = product?.name ?? subreceta?.name ?? null;
  }

  const buffer = await buildKardexWorkbook(rows, { openingQty, openingLabel, productName });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kardex-${dateFrom}-a-${dateTo}.xlsx"`,
    },
  });
}
