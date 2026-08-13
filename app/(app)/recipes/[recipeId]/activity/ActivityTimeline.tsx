"use client";

import { useMemo, useState } from "react";
import type { TimelineEntry } from "@/lib/recipe-activity";

const TYPE_BADGE: Record<string, string> = {
  CREATED: "bg-blue-100 text-blue-800",
  ITEM_ADDED: "bg-green-100 text-green-800",
  ITEM_REMOVED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-neutral-200 text-neutral-700",
  UNARCHIVED: "bg-emerald-100 text-emerald-800",
  UPDATED: "bg-purple-100 text-purple-800",
};

const TYPE_LABEL: Record<string, string> = {
  CREATED: "Creacion",
  ITEM_ADDED: "Ingrediente agregado",
  ITEM_REMOVED: "Ingrediente quitado",
  ARCHIVED: "Archivado",
  UNARCHIVED: "Activada de nuevo",
  UPDATED: "Datos actualizados",
};

export default function ActivityTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return timeline;
    return timeline.filter((entry) => entry.message.toLowerCase().includes(term));
  }, [timeline, search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por producto..."
        className="w-full max-w-sm rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {timeline.length === 0
            ? "Todavia no hay movimientos registrados para esta receta."
            : "Ningun movimiento coincide con la busqueda."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div>
                <span
                  className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[entry.type] ?? "bg-neutral-100 text-neutral-700"}`}
                >
                  {TYPE_LABEL[entry.type] ?? entry.type}
                </span>
                <span className="text-sm text-neutral-800">{entry.message}</span>
              </div>
              <div className="whitespace-nowrap text-right text-xs text-neutral-400">
                <div>{entry.date.toLocaleString("es-MX")}</div>
                <div>{entry.userName ?? "Sistema"}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
