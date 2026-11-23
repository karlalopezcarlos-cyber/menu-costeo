"use client";

import { useActionState, useState } from "react";
import { UNITS, UNIT_LABELS } from "@/lib/units";
import { createCosteador } from "./actions";

const initialState: { error?: string } = {};

export default function NuevaPropuestaForm({
  categorias,
}: {
  categorias: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createCosteador, initialState);
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
      >
        Nueva propuesta
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-medium text-neutral-700">Nueva propuesta</p>

      <input
        name="name"
        required
        autoFocus
        placeholder="Ej. Coctel de temporada, Mezcal con tamarindo"
        className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-500">Rendimiento</span>
          <input
            name="yieldQty"
            type="number"
            step="any"
            min="0"
            defaultValue="1"
            required
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-500">Unidad</span>
          <select
            name="yieldUnit"
            defaultValue="PIECE"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-500">Precio de venta</span>
          <input
            name="sellingPrice"
            type="number"
            step="any"
            min="0"
            placeholder="Opcional"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-500">Categoria</span>
        <select
          name="categoryId"
          defaultValue=""
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Sin categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-500">
          Notas (para que es, como se prepara, que se quiere probar)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear y costear"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-neutral-200 px-3.5 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
