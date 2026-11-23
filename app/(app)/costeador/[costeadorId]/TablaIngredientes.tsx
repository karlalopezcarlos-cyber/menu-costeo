"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import type { RenglonCosteado } from "@/lib/costeador";
import { deleteCosteadorItem, updateCosteadorItemQuantity } from "../actions";

/**
 * Los ingredientes con su costo. La cantidad se edita en la misma celda y guarda al salir del
 * campo: costear es mover cantidades una y otra vez, y un boton por renglon volveria lento
 * justo lo que mas se repite.
 */
export default function TablaIngredientes({
  renglones,
  costoTotal,
}: {
  renglones: RenglonCosteado[];
  costoTotal: number;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardarCantidad(itemId: string, valor: string, original: number) {
    if (Number(valor) === original) return;
    startTransition(async () => {
      const r = await updateCosteadorItemQuantity(itemId, valor);
      setError(r.error ?? null);
      router.refresh();
    });
  }

  function borrar(itemId: string) {
    startTransition(async () => {
      await deleteCosteadorItem(itemId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Ingrediente
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Cantidad
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Costo unitario
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Costo
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {renglones.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Todavia no hay ingredientes. Agrega el primero abajo.
                </td>
              </tr>
            )}
            {renglones.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5">
                  <span className="font-medium text-neutral-900">{r.nombre}</span>
                  {r.tipo === "subreceta" && (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      subreceta
                    </span>
                  )}
                  {r.problema && <p className="text-xs text-amber-600">{r.problema}</p>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      defaultValue={r.quantity}
                      disabled={pendiente}
                      onBlur={(e) => guardarCantidad(r.id, e.target.value, r.quantity)}
                      className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-sm tabular-nums"
                    />
                    <span className="text-xs text-neutral-400">{r.unitLabel}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                  {r.unitCost === null ? "—" : formatMoney(r.unitCost, 4)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {r.lineCost === null ? (
                    <span className="text-amber-600">sin costo</span>
                  ) : (
                    formatMoney(r.lineCost)
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => borrar(r.id)}
                    className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {renglones.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50 font-medium">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right text-neutral-500">
                  Costo del rendimiento completo
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(costoTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
