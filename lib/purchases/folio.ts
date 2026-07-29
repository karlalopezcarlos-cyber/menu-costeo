export function formatPurchaseFolio(folio: number): string {
  return `COM-${String(folio).padStart(4, "0")}`;
}

export function parsePurchaseFolio(value: string): number | null {
  const match = /^(?:COM-)?0*(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
