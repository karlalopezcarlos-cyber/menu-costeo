import type { KardexFilters } from "@/lib/kardex-types";

/** Lee los filtros del kardex de una URL o de los searchParams de la pagina. */
export function readKardexFilters(get: (key: string) => string | null | undefined): KardexFilters {
  const value = (key: string) => (get(key) ?? "").toString();
  return {
    productId: value("product"),
    search: value("q"),
    folio: value("folio"),
    user: value("user"),
    type: value("type"),
    dateFrom: value("from"),
    dateTo: value("to"),
  };
}

export function hasAnyKardexFilter(filters: KardexFilters): boolean {
  return Boolean(
    filters.productId ||
      filters.search.trim() ||
      filters.folio.trim() ||
      filters.user ||
      filters.type ||
      filters.dateFrom ||
      filters.dateTo,
  );
}
