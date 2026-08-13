/**
 * La fecha mas cercana (a medianoche UTC) que ya cumple la anticipacion minima configurada -- una
 * fecha de entrega solo se ofrece/acepta si cae en o despues de este dia.
 */
export function earliestAllowedDeliveryDate(leadDays: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + leadDays);
  return date;
}

/**
 * Genera la lista de horarios ("HH:MM") a partir de la hora de inicio, la duracion de cada
 * horario en minutos, y cuantos horarios generar. Ej. ("14:00", 30, 4) -> ["14:00","14:30",
 * "15:00","15:30"]. Puramente en memoria, sin acceso a base de datos, para poder probarse aislado.
 */
export function generateDeliverySlots(startTime: string, slotMinutes: number, slotsCount: number): string[] {
  if (!startTime || slotsCount <= 0 || slotMinutes <= 0) return [];
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [];

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  if (Number.isNaN(startHour) || Number.isNaN(startMinute)) return [];

  const slots: string[] = [];
  let totalMinutes = startHour * 60 + startMinute;
  for (let i = 0; i < slotsCount; i++) {
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    slots.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    totalMinutes += slotMinutes;
  }
  return slots;
}
