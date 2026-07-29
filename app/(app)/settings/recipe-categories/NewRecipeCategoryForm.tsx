"use client";

import { useActionState } from "react";
import { createRecipeCategory } from "./actions";

const initialState: { error?: string } = {};

export default function NewRecipeCategoryForm() {
  const [state, formAction, pending] = useActionState(createRecipeCategory, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nueva categoria
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Ej. Entradas, Platos fuertes, Postres"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "Agregar"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
