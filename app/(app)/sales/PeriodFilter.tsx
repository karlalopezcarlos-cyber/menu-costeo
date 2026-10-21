"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Filtro de periodo que se aplica al cambiar la fecha, sin tener que apretar "Ver".
 *
 * Conserva la pestana y el modo de IVA que se traia, para que cambiar el periodo no te regrese
 * a otra vista.
 */
export default function PeriodFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function aplicar(campo: "from" | "to", valor: string) {
    if (!valor) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(campo, valor);
    startTransition(() => router.push(`/sales?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor="from" className="text-sm font-medium text-neutral-700">
          Desde
        </label>
        <input
          id="from"
          type="date"
          defaultValue={from}
          onChange={(e) => aplicar("from", e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="to" className="text-sm font-medium text-neutral-700">
          Hasta
        </label>
        <input
          id="to"
          type="date"
          defaultValue={to}
          onChange={(e) => aplicar("to", e.target.value)}
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>
      {pending && <span className="pb-2 text-xs text-neutral-400">Actualizando...</span>}
    </div>
  );
}
