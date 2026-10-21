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

/**
 * Zona horaria del negocio.
 *
 * El servidor corre en UTC, asi que una venta capturada a las 7:15 p.m. se veia como la 1:15
 * a.m. del dia siguiente: seis horas de mas y la fecha equivocada. Las fechas puras (@db.Date)
 * no sufren esto y se siguen leyendo en UTC; los sellos de tiempo —cuando se capturo, cuando se
 * corrigio— tienen que leerse aqui.
 *
 * Es una constante y no una configuracion porque hoy toda la operacion esta en el centro de
 * Mexico. El dia que haya un cliente en Tijuana o en Cancun, esto se vuelve un campo de la
 * sucursal; no antes.
 */
export const ZONA_HORARIA = "America/Mexico_City";

/** Fecha y hora de un sello de tiempo, en la hora del negocio (ej. "20/10/26, 7:15 p.m."). */
export function formatDateTime(value: Date): string {
  return value.toLocaleString("es-MX", {
    timeZone: ZONA_HORARIA,
    dateStyle: "short",
    timeStyle: "short",
  });
}
