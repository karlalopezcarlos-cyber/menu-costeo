/**
 * Excel no acepta cualquier cosa como nombre de pestana: prohibe : \ / ? * [ ] y la corta en 31
 * caracteres. Un nombre que arma un periodo con fechas en formato es-MX ("1/10/2026") trae
 * diagonales y hace que exceljs tire la exportacion entera antes de escribir una sola fila.
 *
 * Esto vive en una funcion y no copiado en cada archivo porque ya paso: dos exportaciones
 * traian el replace y la de Ingenieria de menu no, asi que ese boton llevaba desde que se
 * escribio devolviendo un error en vez de un archivo.
 */
export function excelSheetName(raw: string, fallback = "Hoja 1"): string {
  const clean = raw
    .replace(/[*?:\\/[\]]/g, "-")
    // Una comilla simple al principio o al final tampoco la acepta.
    .replace(/^'+|'+$/g, "")
    .trim()
    .slice(0, 31)
    .trim();
  return clean.length > 0 ? clean : fallback;
}
