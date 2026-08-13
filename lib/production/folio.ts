export function formatProductionFolio(folio: number): string {
  return `PROD-${String(folio).padStart(4, "0")}`;
}
