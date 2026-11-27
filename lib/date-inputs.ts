import { ZONA_HORARIA } from "@/lib/format";

/**
 * Las fechas por omision de las pantallas, en la hora de Mexico y no la del servidor.
 *
 * El servidor corre en UTC. Con `new Date().toISOString()`, a partir de las 6 de la tarde en
 * Mexico "hoy" ya era maniana: quien capturaba una compra en la noche la guardaba bien y
 * despues no la encontraba, porque la lista venia filtrada a un dia que todavia no empezaba.
 * "en-CA" se usa nomas porque imprime AAAA-MM-DD, que es lo que entiende un <input type="date">.
 */

/** Hoy, en el formato que usan los <input type="date">. */
export function todayDateInputValue(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_HORARIA });
}

/** Primer dia del mes en curso, en el mismo formato. */
export function monthStartDateInputValue(): string {
  return `${todayDateInputValue().slice(0, 7)}-01`;
}
