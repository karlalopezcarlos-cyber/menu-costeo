"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Fijo o variable. Es lo unico que hace falta para que el Estado de Resultados pueda calcular
 * el punto de equilibrio, y es una pregunta sencilla: si vendieras la mitad, ¿pagarias lo
 * mismo? Si si, es fijo.
 *
 * Guarda al cambiar, sin boton, igual que el grupo de al lado: normalmente se clasifican
 * varias filas seguidas.
 */
export default function CostBehaviorSelect({
  id,
  initialValue,
  action,
}: {
  id: string;
  initialValue: "FIJO" | "VARIABLE";
  action: (id: string, value: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={initialValue}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.value;
        startTransition(async () => {
          await action(id, valor);
          router.refresh();
        });
      }}
      className="rounded-md border border-neutral-200 px-2 py-1 text-sm disabled:text-neutral-400"
    >
      <option value="FIJO">Fijo</option>
      <option value="VARIABLE">Variable</option>
    </select>
  );
}
