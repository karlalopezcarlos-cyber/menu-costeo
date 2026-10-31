/** Hoy, en el formato que usan los <input type="date">. */
export function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Primer dia del mes en curso, en el mismo formato. */
export function monthStartDateInputValue(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
}
