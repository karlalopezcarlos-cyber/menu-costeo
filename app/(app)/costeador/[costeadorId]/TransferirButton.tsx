"use client";

import { useActionState } from "react";
import { transferirAReceta } from "../actions";

const initialState: { error?: string } = {};

/**
 * El paso de propuesta a receta. Pide confirmacion porque crea algo en el catalogo real: a
 * partir de ahi el platillo entra al costeo, al inventario y a la ingenieria de menu.
 */
export default function TransferirButton({
  costeadorId,
  nombre,
  sinIngredientes,
}: {
  costeadorId: string;
  nombre: string;
  sinIngredientes: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    transferirAReceta.bind(null, costeadorId),
    initialState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Crear la receta "${nombre}" en el catalogo de esta sucursal.\n\n` +
            "A partir de ahi entra al costeo, al inventario y a la ingenieria de menu, y se le " +
            "pueden cargar ventas. La propuesta se queda guardada como el costeo con el que se " +
            "autorizo.\n\nNo se crea en las demas sucursales.",
        );
        if (!ok) e.preventDefault();
      }}
      className="space-y-2"
    >
      <button
        type="submit"
        disabled={pending || sinIngredientes}
        title={sinIngredientes ? "Agregale ingredientes antes de transferirla" : undefined}
        className="w-full rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? "Transfiriendo..." : "Autorizar y pasar a Recetas"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
