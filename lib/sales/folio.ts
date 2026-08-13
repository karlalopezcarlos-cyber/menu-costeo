export function formatSaleFolio(folio: number): string {
  return `VTA-${String(folio).padStart(4, "0")}`;
}
