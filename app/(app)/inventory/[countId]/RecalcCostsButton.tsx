"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recalcInventoryCountCosts, type RecalcCostsState } from "./actions";

/**
 * Revalua el conteo con los costos de hoy. No cambia ninguna cantidad, por eso no pide
 * confirmacion: lo peor que puede pasar es que el valor quede igual.
 */
export default function RecalcCostsButton({ countId }: { countId: string }) {
  const [state, setState] = useState<RecalcCostsState>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const resultado = await recalcInventoryCountCosts(countId);
            setState(resultado);
            if (resultado.ok) router.refresh();
          })
        }
        className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
      >
        {pending ? "Recalculando..." : "Recalcular con los costos de hoy"}
      </button>

      {state.ok && (
        <p className="text-sm text-emerald-700">
          {state.ok.renglones} renglones revaluados. Valor del inventario: {state.ok.valor}
        </p>
      )}
      {state.message && <p className="text-sm text-red-700">{state.message}</p>}
    </div>
  );
}
