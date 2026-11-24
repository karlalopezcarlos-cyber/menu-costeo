"use client";

import { useTransition } from "react";
import { deleteCosteador } from "./actions";

/**
 * Borra una propuesta desde la lista.
 *
 * Pide confirmacion con el nombre adentro porque son varias en la misma tabla y el boton de la
 * fila de arriba queda a unos pixeles del de la de abajo. Y si ya se autorizo lo dice: borrarla
 * no toca la receta, pero si tira el costeo con el que se decidio crearla.
 */
export default function BorrarPropuesta({
  costeadorId,
  nombre,
  yaEsReceta,
}: {
  costeadorId: string;
  nombre: string;
  yaEsReceta: boolean;
}) {
  const [pendiente, startTransition] = useTransition();

  function borrar() {
    const aviso = yaEsReceta
      ? `Borrar la propuesta "${nombre}".\n\nLa receta que se creo con ella NO se borra y sigue en el catalogo. Lo que se pierde es el costeo con el que se autorizo: con que ingredientes, a que costo y a que precio se presento.`
      : `Borrar la propuesta "${nombre}" y sus ingredientes.\n\nNo se puede deshacer.`;
    if (!window.confirm(aviso)) return;
    // La accion termina con un redirect a esta misma lista, asi que no hace falta refrescar
    // a mano: la navegacion vuelve a pedir la pagina ya sin la propuesta.
    startTransition(() => deleteCosteador(costeadorId));
  }

  return (
    <button
      type="button"
      onClick={borrar}
      disabled={pendiente}
      title={`Borrar ${nombre}`}
      className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
    >
      {pendiente ? "Borrando..." : "Borrar"}
    </button>
  );
}
