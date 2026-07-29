"use client";

import { useActionState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS } from "@/lib/units";
import { createRecipe } from "../actions";

const initialState: { error?: string } = {};

export default function NewRecipeForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createRecipe, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Ej. Salsa base, o Tacos al pastor"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="categoryId" className="text-sm font-medium text-neutral-700">
          Categoria (opcional)
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue=""
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">Sin categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Link href="/settings/recipe-categories" className="text-xs text-neutral-500 hover:underline">
          Administrar categorias
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="yieldQty" className="text-sm font-medium text-neutral-700">
            Rendimiento
          </label>
          <input
            id="yieldQty"
            name="yieldQty"
            type="number"
            step="any"
            min="0"
            required
            placeholder="1"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="yieldUnit" className="text-sm font-medium text-neutral-700">
            Unidad de rendimiento
          </label>
          <select
            id="yieldUnit"
            name="yieldUnit"
            required
            defaultValue="PIECE"
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

      <div className="flex items-center gap-2">
        <input id="isMenuItem" name="isMenuItem" type="checkbox" className="h-4 w-4" />
        <label htmlFor="isMenuItem" className="text-sm text-neutral-700">
          Es un platillo de menu (vendible)
        </label>
      </div>

      <div className="space-y-1">
        <label htmlFor="sellingPrice" className="text-sm font-medium text-neutral-700">
          Precio de venta (opcional)
        </label>
        <input
          id="sellingPrice"
          name="sellingPrice"
          type="number"
          step="any"
          min="0"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <p className="text-xs text-neutral-400">
        Despues de guardar podras agregar los ingredientes (productos o subrecetas) de esta receta.
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar y agregar ingredientes"}
        </button>
        <Link href="/recipes" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
