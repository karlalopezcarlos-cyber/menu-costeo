import type { KeyboardEvent } from "react";

/**
 * Evita que Enter guarde un formulario de captura.
 *
 * En pantallas con varios renglones (una compra con tres productos, un porcionamiento con dos
 * tamanos) el usuario usa Enter para avanzar entre campos, y terminaba guardando la captura a
 * medias. Enter sigue funcionando donde se espera: dentro de un textarea hace salto de linea, y
 * sobre un boton lo activa.
 */
export function blockEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return;

  const target = event.target as HTMLElement | null;
  if (!target) return;

  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON") return;
  // Enlaces y elementos con rol de boton tambien deben responder a Enter.
  if (tag === "A" || target.getAttribute("role") === "button") return;

  event.preventDefault();
}
