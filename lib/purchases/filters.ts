/**
 * Los filtros de la lista de compras, sin nada del servidor.
 *
 * Viven aparte de query.ts porque la tabla es un componente de cliente y query.ts importa
 * Prisma: traerse de ahi una sola constante arrastraba el cliente de la base de datos al
 * bundle del navegador.
 */
export type PurchaseListFilters = {
  search: string;
  folio: string;
  dateFrom: string;
  dateTo: string;
  pendingOnly: boolean;
  supplier: string;
  /** Nombre de la categoria del producto, o SIN_ASIGNAR para los productos sin categoria. */
  category: string;
  /** Nombre del grupo de costo al que cuelga la categoria, o SIN_ASIGNAR. */
  costGroup: string;
};

/** Valor de los dos selectores para "lo que no tiene nada asignado". */
export const SIN_ASIGNAR = "none";

export function hasAnyPurchaseFilter(filters: PurchaseListFilters): boolean {
  return Boolean(
    filters.search.trim() ||
      filters.folio.trim() ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.pendingOnly ||
      filters.supplier ||
      filters.category ||
      filters.costGroup,
  );
}
