"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { restoreDeletedDay } from "./actions";

export type DeletedDay = {
  dateKey: string;
  dateLabel: string;
  ventas: number;
  importe: number;
  cuandoLabel: string;
  quien: string | null;
};

/**
 * Dias borrados que todavia se pueden devolver.
 *
 * Borrar un dia se puede repetir de mas sin darse cuenta —la tabla se recarga y el siguiente
 * dia sube al mismo lugar— asi que el borrado no puede ser definitivo. La bitacora guardo la
 * cantidad y el precio de cada venta, y con eso se reconstruyen.
 */
export default function DeletedDaysPanel({ days }: { days: DeletedDay[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (days.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        {days.length === 1
          ? "1 dia borrado en este periodo"
          : `${days.length} dias borrados en este periodo`}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">
        Sus ventas se pueden devolver tal como estaban. Regresan como capturadas a mano: los
        renglones del archivo original ya no vuelven.
      </p>

      <ul className="mt-3 space-y-1.5">
        {days.map((day) => (
          <li key={day.dateKey} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-900">
            <span className="font-medium">{day.dateLabel}</span>
            <span className="text-amber-700">
              · {day.ventas} {day.ventas === 1 ? "venta" : "ventas"} · {formatMoney(day.importe)}
            </span>
            <span className="text-xs text-amber-700">
              · borrado el {day.cuandoLabel}
              {day.quien ? ` por ${day.quien}` : ""}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `Devolver las ${day.ventas} ventas del ${day.dateLabel} tal como estaban antes de borrarse. Lo que ya se haya capturado de ese dia no se toca. ¿Las restauro?`,
                  )
                ) {
                  return;
                }
                setMensaje(null);
                startTransition(async () => {
                  try {
                    const r = await restoreDeletedDay(day.dateKey);
                    setMensaje(
                      r.restauradas === 0
                        ? `No habia nada que devolver del ${day.dateLabel}: ese dia ya tiene sus ventas.`
                        : `${r.restauradas} ventas devueltas al ${day.dateLabel}.`,
                    );
                    router.refresh();
                  } catch (e) {
                    setMensaje(e instanceof Error ? e.message : "No se pudo restaurar.");
                  }
                });
              }}
              className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
            >
              {pending ? "..." : "Restaurar"}
            </button>
          </li>
        ))}
      </ul>

      {mensaje && <p className="mt-2 text-xs font-medium text-amber-900">{mensaje}</p>}
    </div>
  );
}
