/**
 * Monto en pesos con separador de miles (ej. $12,345.67 / -$1,500.50). El signo va antes del "$",
 * no entre el "$" y el numero (toLocaleString por si solo produce "$-1,500.50").
 */
export function formatMoney(value: number, decimals: number = 2): string {
  const sign = value < 0 ? "-" : "";
  const formatted = Math.abs(value).toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${formatted}`;
}
