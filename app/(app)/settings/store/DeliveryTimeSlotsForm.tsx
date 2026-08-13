"use client";

import { useActionState, useMemo, useState } from "react";
import { updateDeliveryTimeSlots } from "./actions";
import { generateDeliverySlots } from "@/lib/store/delivery-slots";

const initialState: { error?: string; success?: boolean } = {};

export default function DeliveryTimeSlotsForm({
  deliveryStartTime,
  deliverySlotMinutes,
  deliverySlotsCount,
  deliverySlotCapacity,
  deliveryLeadDays,
}: {
  deliveryStartTime: string;
  deliverySlotMinutes: number;
  deliverySlotsCount: number;
  deliverySlotCapacity: number;
  deliveryLeadDays: number;
}) {
  const [state, formAction, pending] = useActionState(updateDeliveryTimeSlots, initialState);
  const [startTime, setStartTime] = useState(deliveryStartTime || "14:00");
  const [slotMinutes, setSlotMinutes] = useState(String(deliverySlotMinutes));
  const [slotsCount, setSlotsCount] = useState(String(deliverySlotsCount));
  const [slotCapacity, setSlotCapacity] = useState(String(deliverySlotCapacity));
  const [leadDays, setLeadDays] = useState(String(deliveryLeadDays));

  const preview = useMemo(
    () => generateDeliverySlots(startTime, Number(slotMinutes) || 0, Number(slotsCount) || 0),
    [startTime, slotMinutes, slotsCount],
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <p className="text-sm font-medium text-neutral-700">Horarios de entrega (opcional)</p>
        <p className="text-xs text-neutral-500">
          Si defines horarios, el cliente tiene que elegir uno al pedir a domicilio, y cada horario
          se bloquea solo cuando se llena. Deja "Numero de horarios" en 0 para no usar horarios.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="deliveryStartTime" className="text-xs font-medium text-neutral-700">
            Hora de inicio
          </label>
          <input
            id="deliveryStartTime"
            name="deliveryStartTime"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="deliverySlotMinutes" className="text-xs font-medium text-neutral-700">
            Minutos por horario
          </label>
          <input
            id="deliverySlotMinutes"
            name="deliverySlotMinutes"
            type="number"
            min="1"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="deliverySlotsCount" className="text-xs font-medium text-neutral-700">
            Numero de horarios
          </label>
          <input
            id="deliverySlotsCount"
            name="deliverySlotsCount"
            type="number"
            min="0"
            value={slotsCount}
            onChange={(e) => setSlotsCount(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="deliverySlotCapacity" className="text-xs font-medium text-neutral-700">
            Pedidos por horario
          </label>
          <input
            id="deliverySlotCapacity"
            name="deliverySlotCapacity"
            type="number"
            min="1"
            value={slotCapacity}
            onChange={(e) => setSlotCapacity(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
          />
        </div>
      </div>

      {preview.length > 0 && (
        <p className="text-xs text-neutral-500">
          Horarios que se generan: <span className="font-medium text-neutral-700">{preview.join(", ")}</span>
        </p>
      )}

      <div className="max-w-xs space-y-1 border-t border-neutral-100 pt-3">
        <label htmlFor="deliveryLeadDays" className="text-sm font-medium text-neutral-700">
          Dias de anticipacion minimos
        </label>
        <input
          id="deliveryLeadDays"
          name="deliveryLeadDays"
          type="number"
          min="0"
          value={leadDays}
          onChange={(e) => setLeadDays(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          Un dia de entrega configurado solo se le muestra al cliente si falta al menos esta
          cantidad de dias (ej. 7 = solo puede pedir con una semana de anticipacion).
        </p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Configuracion guardada.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar horarios"}
      </button>
    </form>
  );
}
