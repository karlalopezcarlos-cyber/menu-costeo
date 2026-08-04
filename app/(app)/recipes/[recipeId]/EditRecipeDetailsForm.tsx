"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { archiveRecipe, updateRecipeDetails } from "../actions";
import { formatMoney } from "@/lib/format";

const initialState: { error?: string } = {};

export default function EditRecipeDetailsForm({
  recipeId,
  name,
  yieldQty,
  yieldUnit,
  isMenuItem,
  sellingPrice,
}: {
  recipeId: string;
  name: string;
  yieldQty: string;
  yieldUnit: UnitValue;
  isMenuItem: boolean;
  sellingPrice: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const boundAction = updateRecipeDetails.bind(null, recipeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      setEditing(false);
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        {!editing ? (
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">{name}</h1>
            <p className="text-sm text-neutral-500">
              Rendimiento: {yieldQty} {UNIT_LABELS[yieldUnit]}
              {isMenuItem && " - Platillo de menu"}
              {sellingPrice && ` - Precio de venta: ${formatMoney(Number(sellingPrice))}`}
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1 sm:col-span-1">
                <label htmlFor="edit-name" className="text-xs font-medium text-neutral-700">
                  Nombre
                </label>
                <input
                  id="edit-name"
                  name="name"
                  defaultValue={name}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-yieldQty" className="text-xs font-medium text-neutral-700">
                  Rendimiento
                </label>
                <input
                  id="edit-yieldQty"
                  name="yieldQty"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={yieldQty}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="edit-yieldUnit" className="text-xs font-medium text-neutral-700">
                  Unidad
                </label>
                <select
                  id="edit-yieldUnit"
                  name="yieldUnit"
                  defaultValue={yieldUnit}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {pending ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-neutral-500 hover:underline"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 pt-1">
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            Editar
          </button>
        )}
        <a
          href={`/api/export/recipes/${recipeId}/pdf`}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          Exportar a PDF
        </a>
        <button
          type="button"
          onClick={() => {
            archiveRecipe(recipeId);
          }}
          className="text-sm text-neutral-400 hover:text-red-600"
        >
          Archivar receta
        </button>
      </div>
    </div>
  );
}
