export function formatStoreOrderFolio(folio: number): string {
  return `TDA-${String(folio).padStart(4, "0")}`;
}
