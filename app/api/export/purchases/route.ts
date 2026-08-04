import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { buildPurchasesWorkbook } from "@/lib/excel/export-purchases";
import { buildPurchaseWhere, resolvePendingProductIds } from "@/lib/purchases/query";
import {
  sortPurchaseRows,
  toPurchaseRow,
  PURCHASE_SORT_KEYS,
  type PurchaseRow,
  type PurchaseSortKey,
  type SortDir,
} from "@/app/(app)/purchases/purchase-rows";

// Mismo tope que la lista en pantalla (/purchases): protege contra exportar anios de historial
// de un jalon cuando la busqueda no viene acotada por fecha.
const ROW_LIMIT = 5000;

export async function GET(request: NextRequest) {
  const user = await requireOrgSession();

  const params = request.nextUrl.searchParams;
  const search = params.get("q") ?? "";
  const folio = params.get("folio") ?? "";
  const dateFrom = params.get("from") ?? "";
  const dateTo = params.get("to") ?? "";
  const sortKeyRaw = params.get("sortKey") ?? "folio";
  const sortKey = (PURCHASE_SORT_KEYS as string[]).includes(sortKeyRaw)
    ? (sortKeyRaw as PurchaseSortKey)
    : "folio";
  const sortDir: SortDir = params.get("sortDir") === "asc" ? "asc" : "desc";
  const pendingOnly = params.get("pendingOnly") === "1";
  const supplier = params.get("supplier") ?? "";

  const filters = { search, folio, dateFrom, dateTo, pendingOnly, supplier };
  const pendingProductIds = pendingOnly ? await resolvePendingProductIds(user.organizationId) : null;
  const where = buildPurchaseWhere(user.organizationId, filters, pendingProductIds);

  const purchases = await prisma.purchase.findMany({
    where,
    orderBy: [{ purchaseDate: "desc" }, { folio: "desc" }],
    take: ROW_LIMIT,
    include: { product: true, supplier: true },
  });

  const rows: PurchaseRow[] = purchases.map((purchase) => toPurchaseRow(purchase, false));
  const sorted = sortPurchaseRows(rows, sortKey, sortDir);

  const buffer = await buildPurchasesWorkbook(sorted);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="compras.xlsx"`,
    },
  });
}
