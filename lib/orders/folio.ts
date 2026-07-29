export function formatOrderFolio(folio: number): string {
  return `PED-${String(folio).padStart(4, "0")}`;
}
