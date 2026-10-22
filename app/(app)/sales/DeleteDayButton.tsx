"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { deleteSalesForDay } from "./actions";

/**
 * Borrar un dia completo no se deshace, asi que la confirmacion dice exactamente que se lleva:
 * cuantos platillos, cuanto dinero y si ese dia tenia tickets que NO se van a borrar.
 */
export default function DeleteDayButton({
  dateKey,
  dateLabel,
  dishes,
  total,
  tickets,
}: {
  dateKey: string;
  dateLabel: string;
  dishes: number;
  total: number;
  tickets: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const aviso =
            `Vas a borrar las ventas del ${dateLabel}: ${dishes} ${dishes === 1 ? "platillo" : "platillos"} por ${formatMoney(total)}.\n\n` +
            "Se borran tambien los renglones importados de ese dia, para que no vuelva a aparecer solo.\n\n" +
            (tickets > 0
              ? `OJO: ese dia tiene ${tickets} ${tickets === 1 ? "ticket" : "tickets"} de venta. Esos NO se borran; si tambien sobran, borralos desde "Ver tickets de venta".\n\n`
              : "") +
            "Esto no se puede deshacer. ¿Lo borro?";
          if (!confirm(aviso)) return;

          setError(null);
          startTransition(async () => {
            try {
              await deleteSalesForDay(dateKey);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo borrar el dia.");
            }
          });
        }}
        className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "Borrando..." : "Borrar dia"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
