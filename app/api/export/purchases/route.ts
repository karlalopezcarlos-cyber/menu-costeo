import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildPurchasesWorkbook } from "@/lib/excel/export-purchases";
import {
  filterPurchaseRows,
  sortPurchaseRows,
  toPurchaseRow,
  PURCHASE_SORT_KEYS,
  type PurchaseRow,
  type PurchaseSortKey,
  type SortDir,
} from "@/app/(app)/purchases/purchase-rows";

export async function GET(request: NextRequest) {
  const user = await requireOrgSession();

  const params = request.nextUrl.searchParams;
  const search = params.get("q") ?? "";
  const dateFrom = params.get("from") ?? "";
  const dateTo = params.get("to") ?? "";
  const sortKeyRaw = params.get("sortKey") ?? "date";
  const sortKey = (PURCHASE_SORT_KEYS as string[]).includes(sortKeyRaw)
    ? (sortKeyRaw as PurchaseSortKey)
    : "date";
  const sortDir: SortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const pendingOnly = params.get("pendingOnly") === "1";
  const supplier = params.get("supplier") ?? "";

  // Mismo limite y orden base que la lista en pantalla (/purchases), para exportar exactamente lo visible.
  const [purchases, openOrderItems] = await Promise.all([
    prisma.purchase.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { purchaseDate: "desc" },
      take: 100,
      include: { product: true, supplier: true },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { organizationId: user.organizationId, status: "OPEN" } },
      select: { productId: true, quantity: true, receivedQuantity: true },
    }),
  ]);

  const productIdsWithPending = new Set(
    openOrderItems
      .filter((item) => {
        const received = item.receivedQuantity != null ? Number(item.receivedQuantity) : 0;
        return Number(item.quantity) - received > 0;
      })
      .map((item) => item.productId),
  );

  const rows: PurchaseRow[] = purchases.map((purchase) =>
    toPurchaseRow(purchase, productIdsWithPending.has(purchase.productId)),
  );

  const filtered = filterPurchaseRows(rows, { search, dateFrom, dateTo, pendingOnly, supplier });
  const sorted = sortPurchaseRows(filtered, sortKey, sortDir);

  const buffer = await buildPurchasesWorkbook(sorted);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="compras.xlsx"`,
    },
  });
}
