/**
 * Normaliza un nombre de platillo para matching tolerante a mayusculas/acentos/puntuacion/espacios.
 * Deliberadamente conservador (sin stemming) para no fusionar por error platillos distintos
 * como "Tacos de asada" y "Tacos de asada c/queso".
 */
export function normalize(text: string): string {
  const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
