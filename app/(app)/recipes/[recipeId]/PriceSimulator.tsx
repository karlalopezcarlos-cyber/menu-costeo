"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { updateRecipeSellingPrice } from "./price-actions";

/** Objetivos de costo que se usan para sugerir precio. */
const OBJETIVOS = [25, 30, 35];

/**
 * Simulador de precio: deja mover el precio de venta y ver al instante como se mueve el
 * porcentaje de costo y la utilidad, sin guardar nada hasta que se decide.
 */
export default function PriceSimulator({
  recipeId,
  totalCost,
  savedPrice,
}: {
  recipeId: string;
  totalCost: number;
  savedPrice: number | null;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(savedPrice ? String(savedPrice) : "");
  const [pending, startTransition] = useTransition();
  const [guardado, setGuardado] = useState<string | null>(null);

  const simulado = useMemo(() => {
    const valor = Number(price);
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return {
      precio: valor,
      costPct: (totalCost / valor) * 100,
      utilidad: valor - totalCost,
    };
  }, [price, totalCost]);

  const cambio = simulado !== null && savedPrice !== null && Math.abs(simulado.precio - savedPrice) > 0.005;
  const sinGuardar = simulado !== null && savedPrice === null;

  function guardar() {
    if (!simulado) return;
    startTransition(async () => {
      const result = await updateRecipeSellingPrice(recipeId, simulado.precio);
      if (result?.error) {
        setGuardado(result.error);
        return;
      }
      setGuardado("Precio guardado.");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-neutral-200 pt-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label htmlFor="simPrice" className="text-xs font-medium text-neutral-500">
            Probar un precio de venta
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-neutral-400">$</span>
            <input
              id="simPrice"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setGuardado(null);
              }}
              placeholder="75.00"
              className="w-28 rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {simulado && (
          <>
            <div>
              <p className="text-xs font-medium text-neutral-500">Costo</p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  simulado.costPct <= 33 ? "text-green-700" : "text-red-600"
                }`}
              >
                {simulado.costPct.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Deja</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900">
                {formatMoney(simulado.utilidad)}
              </p>
            </div>
          </>
        )}

        {(cambio || sinGuardar) && (
          <button
            type="button"
            onClick={guardar}
            disabled={pending}
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Usar este precio"}
          </button>
        )}
        {guardado && <span className="text-xs text-neutral-500">{guardado}</span>}
      </div>

      {/* Camino inverso: en vez de adivinar precios, partir del costo que se quiere lograr. */}
      {totalCost > 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          Para lograr{" "}
          {OBJETIVOS.map((objetivo, i) => (
            <span key={objetivo}>
              {i > 0 ? " · " : ""}
              <b className="text-neutral-700">{objetivo}%</b> de costo, vende en{" "}
              <button
                type="button"
                onClick={() => setPrice(((totalCost / objetivo) * 100).toFixed(2))}
                className="font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                {formatMoney((totalCost / objetivo) * 100)}
              </button>
            </span>
          ))}
        </p>
      )}

      {savedPrice !== null && cambio && (
        <p className="mt-1 text-xs text-neutral-400">
          Precio guardado hoy: {formatMoney(savedPrice)}. Lo de arriba es una simulacion hasta que
          le des &quot;Usar este precio&quot;.
        </p>
      )}
    </div>
  );
}
