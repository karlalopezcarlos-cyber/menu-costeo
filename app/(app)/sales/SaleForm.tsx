"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateDailySale, upsertDailySale } from "./actions";
import SearchableSelect from "../_components/SearchableSelect";
import type { SaleRow } from "./SalesTable";

type RecipeOption = { id: string; name: string; sellingPrice: string | null };

const initialState: { error?: string } = {};

export default function SaleForm({
  recipes,
  editing,
  onCancelEdit,
}: {
  recipes: RecipeOption[];
  editing: SaleRow | null;
  onCancelEdit: () => void;
}) {
  const action = editing ? updateDailySale.bind(null, editing.id) : upsertDailySale;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [recipeId, setRecipeId] = useState(editing?.recipeId ?? "");
  const [unitPrice, setUnitPrice] = useState(editing ? editing.unitPrice.toString() : "");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error && editing) {
      onCancelEdit();
    }
    wasPending.current = pending;
  }, [pending, state, editing, onCancelEdit]);

  function handleRecipeChange(id: string) {
    setRecipeId(id);
    const recipe = recipes.find((r) => r.id === id);
    setUnitPrice(recipe?.sellingPrice ?? "");
  }

  return (
    <form
      action={formAction}
      className="grid grid-cols-[9rem_minmax(0,1fr)_7rem_8rem_auto] items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="space-y-1">
        <label htmlFor="date" className="text-sm font-medium text-neutral-700">
          Fecha
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={editing ? editing.dateInputValue : new Date().toISOString().slice(0, 10)}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-neutral-700">Platillo</label>
        <SearchableSelect
          name="recipeId"
          options={recipes.map((r) => ({ id: r.id, label: r.name }))}
          value={recipeId}
          onChange={handleRecipeChange}
          placeholder="Buscar platillo..."
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="quantitySold" className="text-sm font-medium text-neutral-700">
          Cantidad
        </label>
        <input
          id="quantitySold"
          name="quantitySold"
          type="number"
          step="any"
          min="0"
          required
          defaultValue={editing?.quantitySold}
          placeholder="0"
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="unitPrice" className="text-sm font-medium text-neutral-700">
          Precio
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">
            $
          </span>
          <input
            id="unitPrice"
            name="unitPrice"
            type="number"
            step="0.01"
            min="0"
            required
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : editing ? "Guardar cambios" : "Guardar"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-sm text-neutral-500 hover:underline"
          >
            Cancelar
          </button>
        )}
      </div>

      {state?.error && <p className="col-span-5 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
