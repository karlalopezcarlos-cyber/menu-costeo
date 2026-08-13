"use client";

import { useMemo, useState } from "react";

type DateOption = { value: string; label: string };

const WEEKDAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthKey(year: number, month: number): number {
  return year * 12 + month;
}

/**
 * Calendario de mes con solo los dias habilitados (los que el dueno configuro en Configuracion,
 * ya filtrados por anticipacion minima) clicables; el resto se ve deshabilitado. Reemplaza el
 * <select> plano por algo mas visual, tipo selector de fecha de reservaciones.
 */
export default function DeliveryCalendar({
  availableDates,
  value,
  onChange,
}: {
  availableDates: DateOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const availableSet = useMemo(() => new Set(availableDates.map((d) => d.value)), [availableDates]);

  const sortedDates = useMemo(
    () => availableDates.map((d) => d.value).sort(),
    [availableDates],
  );
  const firstAvailable = sortedDates[0];
  const lastAvailable = sortedDates[sortedDates.length - 1];

  const initialMonth = useMemo(() => {
    const base = (value && availableSet.has(value) ? value : firstAvailable) ?? "";
    if (!base) {
      const now = new Date();
      return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
    }
    const [y, m] = base.split("-").map(Number);
    return { year: y, month: m - 1 };
  }, [value, firstAvailable, availableSet]);

  const [current, setCurrent] = useState(initialMonth);

  if (availableDates.length === 0) {
    return <p className="text-sm text-neutral-500">No hay dias de entrega disponibles ahorita.</p>;
  }

  const [minYear, minMonth0] = firstAvailable.split("-").map(Number);
  const [maxYear, maxMonth0] = lastAvailable.split("-").map(Number);
  const minKey = monthKey(minYear, minMonth0 - 1);
  const maxKey = monthKey(maxYear, maxMonth0 - 1);
  const currentKey = monthKey(current.year, current.month);

  const firstOfMonth = new Date(Date.UTC(current.year, current.month, 1));
  const daysInMonth = new Date(Date.UTC(current.year, current.month + 1, 0)).getUTCDate();
  const startOffset = firstOfMonth.getUTCDay();
  const monthLabel = firstOfMonth.toLocaleDateString("es-MX", { timeZone: "UTC", month: "long", year: "numeric" });

  function goToMonth(delta: number) {
    setCurrent((prev) => {
      let month = prev.month + delta;
      let year = prev.year;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      return { year, month };
    });
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${current.year}-${pad(current.month + 1)}-${pad(i + 1)}`),
  ];

  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(-1)}
          disabled={currentKey <= minKey}
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        >
          ‹
        </button>
        <p className="text-sm font-medium capitalize text-neutral-900">{monthLabel}</p>
        <button
          type="button"
          onClick={() => goToMonth(1)}
          disabled={currentKey >= maxKey}
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="py-1 text-xs font-medium text-neutral-400">
            {w}
          </div>
        ))}
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const available = availableSet.has(dateStr);
          const selected = value === dateStr;
          const day = Number(dateStr.slice(-2));
          return (
            <button
              key={dateStr}
              type="button"
              disabled={!available}
              onClick={() => onChange(dateStr)}
              className={`flex aspect-square items-center justify-center rounded-full text-sm ${
                selected
                  ? "bg-neutral-900 font-semibold text-white"
                  : available
                    ? "text-neutral-900 hover:bg-neutral-100"
                    : "text-neutral-300"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
