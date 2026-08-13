"use client";

import { useState } from "react";
import { addDeliveryDate, removeDeliveryDate } from "./actions";

export default function DeliveryDatesManager({
  dates,
}: {
  dates: { id: string; dateLabel: string }[];
}) {
  const [newDate, setNewDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd() {
    if (!newDate) return;
    setPending(true);
    setError(null);
    const result = await addDeliveryDate(newDate);
    if (result.error) setError(result.error);
    else setNewDate("");
    setPending(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <p className="text-sm font-medium text-neutral-700">Dias disponibles para entrega</p>
        <p className="text-xs text-neutral-500">
          Agrega las fechas en las que si vas a tener entregas a domicilio. Los clientes solo van a
          poder elegir de estas.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !newDate}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "Agregar fecha"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-1">
        {dates.length === 0 && (
          <p className="text-sm text-neutral-400">Todavia no hay fechas de entrega configuradas.</p>
        )}
        {dates.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
            <span className="capitalize">{d.dateLabel}</span>
            <button
              type="button"
              onClick={() => removeDeliveryDate(d.id)}
              className="text-neutral-400 hover:text-red-600"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
