import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePurchaseFolio } from "./folio";

export type PurchaseListFilters = {
  search: string;
  folio: string;
  dateFrom: string;
  dateTo: string;
  pendingOnly: boolean;
  supplier: string;
};

export function hasAnyPurchaseFilter(filters: PurchaseListFilters): boolean {
  return Boolean(
    filters.search.trim() ||
      filters.folio.trim() ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.pendingOnly ||
      filters.supplier,
  );
}

export { todayDateInputValue } from "@/lib/date-inputs";

/**
 * Construye el filtro de Prisma a partir de los filtros de la lista de compras. Cuando
 * `pendingProductIds` no es null, se asume que `pendingOnly` esta activo y ya se resolvio
 * el conjunto de productos con saldo pendiente (consulta aparte a PurchaseOrderItem).
 */
export function buildPurchaseWhere(
  sucursalId: string,
  filters: PurchaseListFilters,
  pendingProductIds: string[] | null,
): Prisma.PurchaseWhereInput {
  const where: Prisma.PurchaseWhereInput = { sucursalId };

  // La busqueda libre cubre nombre de producto y folio de factura: el usuario llega con el
  // papel del proveedor en la mano y teclea lo que ve ahi, sin saber en que campo cae.
  const search = filters.search.trim();
  if (search) {
    where.OR = [
      { product: { name: { contains: search, mode: "insensitive" } } },
      { invoiceFolio: { contains: search, mode: "insensitive" } },
    ];
  }

  const folioNumber = filters.folio.trim() ? parsePurchaseFolio(filters.folio) : null;
  if (folioNumber !== null) {
    where.folio = folioNumber;
  }

  // Un folio ya identifica una sola compra de forma precisa: si se busca por folio, el rango de
  // fecha (que puede seguir mostrando "hoy" en pantalla) no debe excluirlo.
  // purchaseDate se guarda como medianoche UTC del dia capturado (new Date("YYYY-MM-DD") en
  // actions.ts, que ECMAScript interpreta como UTC). El rango de filtro debe construirse con el
  // mismo criterio UTC explicito: usar la hora local del servidor aqui desalinea el rango de
  // "hoy" respecto a las compras de hoy mismo (se comprobo que en UTC-6 excluia el dia completo).
  if (folioNumber === null && (filters.dateFrom || filters.dateTo)) {
    where.purchaseDate = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999Z`) } : {}),
    };
  }

  if (filters.supplier) {
    where.supplier = { name: filters.supplier };
  }

  if (pendingProductIds) {
    where.productId = { in: pendingProductIds };
  }

  return where;
}

/** Productos que todavia tienen saldo pendiente en algun pedido abierto de la sucursal. */
export async function resolvePendingProductIds(sucursalId: string): Promise<string[]> {
  const openOrderItems = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrder: { sucursalId, status: "OPEN" } },
    select: { productId: true, quantity: true, receivedQuantity: true },
  });
  return openOrderItems
    .filter((item) => {
      const received = item.receivedQuantity != null ? Number(item.receivedQuantity) : 0;
      return Number(item.quantity) - received > 0;
    })
    .map((item) => item.productId);
}
