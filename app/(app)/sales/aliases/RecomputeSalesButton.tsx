"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recomputeAllImportedSales } from "./actions";

/**
 * Reparacion de una sola pasada para las ventas que se perdieron cuando dos nombres caian en el
 * mismo platillo el mismo dia. No corre sola: cambia numeros de ventas ya registradas y eso se
 * decide a proposito.
 */
export default function RecomputeSalesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Esto vuelve a armar todas tus ventas importadas sumando los renglones de los archivos originales. Sirve para recuperar las ventas que se perdian cuando dos nombres del punto de venta caian en el mismo platillo el mismo dia. Las ventas capturadas a mano no se tocan. ¿Lo hago?",
            )
          ) {
            return;
          }
          setResultado(null);
          startTransition(async () => {
            try {
              const r = await recomputeAllImportedSales();
              setResultado(
                r.corregidos === 0
                  ? `Revise ${r.revisados} dias de venta y no habia nada que corregir.`
                  : `Listo: ${r.corregidos} de ${r.revisados} dias de venta quedaron corregidos.`,
              );
              router.refresh();
            } catch (e) {
              setResultado(e instanceof Error ? e.message : "No se pudo rearmar.");
            }
          });
        }}
        className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
      >
        {pending ? "Rearmando..." : "Rearmar ventas importadas"}
      </button>
      {resultado && <span className="text-xs text-neutral-600">{resultado}</span>}
    </div>
  );
}
