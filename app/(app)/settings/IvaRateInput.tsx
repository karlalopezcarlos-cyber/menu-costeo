"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Tasa de IVA editable al vuelo, sin boton de guardar: es un solo numero y normalmente se
 * acomodan varias filas seguidas. Guarda al salir del campo y no en cada tecla, para no
 * mandar una escritura por digito.
 */
export default function IvaRateInput({
  id,
  initialValue,
  action,
}: {
  id: string;
  initialValue: string;
  action: (id: string, value: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step="any"
        min="0"
        max="100"
        defaultValue={initialValue}
        disabled={pending}
        onBlur={(e) => {
          const valor = e.target.value;
          if (valor === initialValue) return;
          startTransition(async () => {
            await action(id, valor);
            router.refresh();
          });
        }}
        className="w-16 rounded-md border border-neutral-200 px-2 py-1 text-right text-sm tabular-nums disabled:text-neutral-400"
      />
      <span className="text-sm text-neutral-400">%</span>
    </span>
  );
}
