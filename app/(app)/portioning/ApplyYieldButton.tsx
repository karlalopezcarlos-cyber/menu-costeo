"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { aplicarRendimientoAlCatalogo } from "./actions";

/**
 * Llevar el rendimiento de una transformacion a la ficha del producto es una decision, no un
 * efecto secundario: cambia el costo de todas las compras de ese producto.
 */
export default function ApplyYieldButton({
  entryId,
  productName,
  yieldPct,
}: {
  entryId: string;
  productName: string;
  yieldPct: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Esto deja el rendimiento de ${productName} en ${yieldPct.toFixed(2)}% y recostea todas sus compras con ese numero. ¿Lo aplico?`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await aplicarRendimientoAlCatalogo(entryId);
          router.refresh();
        });
      }}
      className="text-xs font-medium text-neutral-400 transition-colors hover:text-brand-600 disabled:opacity-50"
      title={`Dejar el rendimiento de ${productName} en ${yieldPct.toFixed(2)}%`}
    >
      {pending ? "Aplicando..." : "Usar en el catalogo"}
    </button>
  );
}
