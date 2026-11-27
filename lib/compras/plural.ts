/**
 * Plural en espanol, lo suficiente para una etiqueta de presentacion: "Botella" -> "Botellas",
 * "Galon" -> "Galones". No es gramatica completa (no acentua "Galon" ni sabe de "Z" final),
 * pero "3 Galons" en una compra se ve mal hecho y esto cuesta tres lineas.
 */
export function pluralizar(etiqueta: string): string {
  const limpia = etiqueta.trim();
  if (!limpia) return limpia;
  return /[aeiouáéíóú]$/i.test(limpia) ? `${limpia}s` : `${limpia}es`;
}
