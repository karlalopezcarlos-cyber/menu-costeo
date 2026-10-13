/**
 * Vencimiento de un folio de compra segun los dias de credito del proveedor.
 *
 * Las fechas de compra se guardan como medianoche UTC del dia capturado, asi que todo el
 * calculo se hace en UTC: usar la hora local del servidor corre el resultado un dia completo
 * en zonas como la de Mexico (UTC-6).
 */

export type DueState = "vigente" | "hoy" | "vencido";

export type DueInfo = {
  dueDateLabel: string;
  /** Dias que faltan para el vencimiento. Negativo = ya vencio hace esos dias. */
  daysLeft: number;
  state: DueState;
  /** Texto listo para mostrar: "faltan 5 dias", "vence hoy", "vencido hace 3 dias". */
  label: string;
};

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const DIA_MS = 86_400_000;

/**
 * Devuelve null cuando el proveedor no tiene dias de credito configurados: en ese caso no hay
 * nada que calcular y la interfaz muestra un guion en vez de inventar una fecha limite.
 */
export function computeDueInfo(
  purchaseDate: Date,
  creditDays: number | null | undefined,
  today: Date = new Date(),
): DueInfo | null {
  if (creditDays === null || creditDays === undefined) return null;

  const dueMs = startOfUtcDay(purchaseDate) + creditDays * DIA_MS;
  const dueDate = new Date(dueMs);
  const daysLeft = Math.round((dueMs - startOfUtcDay(today)) / DIA_MS);

  const state: DueState = daysLeft > 0 ? "vigente" : daysLeft === 0 ? "hoy" : "vencido";
  const label =
    daysLeft > 1
      ? `faltan ${daysLeft} dias`
      : daysLeft === 1
        ? "falta 1 dia"
        : daysLeft === 0
          ? "vence hoy"
          : daysLeft === -1
            ? "vencido hace 1 dia"
            : `vencido hace ${Math.abs(daysLeft)} dias`;

  return {
    dueDateLabel: dueDate.toLocaleDateString("es-MX", { timeZone: "UTC" }),
    daysLeft,
    state,
    label,
  };
}
