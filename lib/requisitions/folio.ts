export function formatRequisicionFolio(folio: number): string {
  return `REQ-${String(folio).padStart(4, "0")}`;
}

export function parseRequisicionFolio(value: string): number | null {
  const match = /^(?:REQ-)?0*(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
