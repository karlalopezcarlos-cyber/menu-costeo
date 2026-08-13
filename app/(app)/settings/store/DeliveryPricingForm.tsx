"use client";

import { useActionState } from "react";
import { updateDeliveryPricing } from "./actions";

const initialState: { error?: string; success?: boolean } = {};

export default function DeliveryPricingForm({
  deliveryBaseFee,
  deliveryPricePerKm,
  deliveryMinOrder,
  deliveryMaxKm,
}: {
  deliveryBaseFee: string;
  deliveryPricePerKm: string;
  deliveryMinOrder: string;
  deliveryMaxKm: string;
}) {
  const [state, formAction, pending] = useActionState(updateDeliveryPricing, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="deliveryBaseFee" className="text-sm font-medium text-neutral-700">
            Cuota fija
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
            <input
              id="deliveryBaseFee"
              name="deliveryBaseFee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={deliveryBaseFee}
              className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="deliveryPricePerKm" className="text-sm font-medium text-neutral-700">
            Precio por km
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
            <input
              id="deliveryPricePerKm"
              name="deliveryPricePerKm"
              type="number"
              step="0.01"
              min="0"
              defaultValue={deliveryPricePerKm}
              className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="deliveryMinOrder" className="text-sm font-medium text-neutral-700">
            Pedido minimo
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">$</span>
            <input
              id="deliveryMinOrder"
              name="deliveryMinOrder"
              type="number"
              step="0.01"
              min="0"
              defaultValue={deliveryMinOrder}
              className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="deliveryMaxKm" className="text-sm font-medium text-neutral-700">
            Distancia maxima
          </label>
          <div className="relative">
            <input
              id="deliveryMaxKm"
              name="deliveryMaxKm"
              type="number"
              step="0.1"
              min="0"
              defaultValue={deliveryMaxKm}
              placeholder="10"
              className="w-full rounded-md border border-neutral-300 py-2 pl-2 pr-8 text-sm"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">km</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Costo de envio = cuota fija + (precio por km x km reales de la ruta). El pedido minimo solo
        aplica a envio a domicilio, no a recoger en tienda. Deja la distancia maxima en 0 para no
        limitarla.
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Tarifa guardada.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar tarifa"}
      </button>
    </form>
  );
}
