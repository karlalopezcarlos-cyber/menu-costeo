"use client";

import { useActionState } from "react";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { updateCosteador } from "../actions";

const initialState: { error?: string } = {};

export default function EditarPropuesta({
  costeadorId,
  valores,
  categorias,
}: {
  costeadorId: string;
  valores: {
    name: string;
    yieldQty: string;
    yieldUnit: UnitValue;
    categoryId: string | null;
    isMenuItem: boolean;
    sellingPrice: string;
    notes: string;
  };
  categorias: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    updateCosteador.bind(null, costeadorId),
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-medium text-neutral-700">Datos de la propuesta</p>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-500">Nombre</span>
        <input
          name="name"
          required
          defaultValue={valores.name}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-500">Rendimiento</span>
          <input
            name="yieldQty"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={valores.yieldQty}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-500">Unidad</span>
          <select
            name="yieldUnit"
            defaultValue={valores.yieldUnit}
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
            placeholder="Sin precio"
            defaultValue={valores.sellingPrice}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-500">Categoria</span>
        <select
          name="categoryId"
          defaultValue={valores.categoryId ?? ""}
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

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          name="isMenuItem"
          defaultChecked={valores.isMenuItem}
          className="rounded border-neutral-300"
        />
        Se vende al cliente (si lo apagas, al autorizarla nace como subreceta)
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-neutral-500">
          Notas · al autorizarla pasan a ser las instrucciones de la receta
        </span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={valores.notes}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
