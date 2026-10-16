"use client";

import { useActionState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";
import type { PortionState } from "./actions";

const initialState: PortionState = {};

export type PortionFormValues = {
  name: string;
  portionQty: string;
  portionUnit: UnitValue;
  extrasRecipeId: string | null;
  categoryId: string | null;
  defaultSourceProductId: string | null;
};

export default function PortionForm({
  action,
  values,
  categories,
  recipes,
  sourceProducts,
  submitLabel,
}: {
  action: (prev: PortionState | undefined, formData: FormData) => Promise<PortionState>;
  values?: PortionFormValues;
  categories: { id: string; name: string }[];
  recipes: { id: string; name: string }[];
  sourceProducts: { id: string; name: string; isProcessed: boolean }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      action={formAction}
      onKeyDown={blockEnterSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nombre de la porcion
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={values?.name ?? ""}
          placeholder="CAMARON 20 G"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          Va a quedar como un producto mas de tu catalogo, que se cuenta por pieza.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="defaultSourceProductId" className="text-sm font-medium text-neutral-700">
          Sale normalmente de (opcional)
        </label>
        <select
          id="defaultSourceProductId"
          name="defaultSourceProductId"
          defaultValue={values?.defaultSourceProductId ?? ""}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Lo elijo cada vez</option>
          {sourceProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.isProcessed ? " (de proceso)" : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          De donde sale normalmente esta porcion: el producto crudo o el ya limpio (POLLO LIMPIO).
          Solo sirve para que aparezca primero al registrar la transformacion. El dia que
          porciones del crudo directo, eliges el crudo y ya.{" "}
          <Link href="/products/new" className="text-brand-600 underline-offset-2 hover:underline">
            ¿Falta el producto limpio? Crealo aqui
          </Link>
          , marcando &quot;se obtiene por proceso&quot;.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="portionQty" className="text-sm font-medium text-neutral-700">
            Cuanto lleva una porcion
          </label>
          <input
            id="portionQty"
            name="portionQty"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={values?.portionQty ?? ""}
            placeholder="20"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="portionUnit" className="text-sm font-medium text-neutral-700">
            Unidad
          </label>
          <select
            id="portionUnit"
            name="portionUnit"
            required
            defaultValue={values?.portionUnit ?? "G"}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        Esto no limita nada: si un dia salen porciones de 25 g, lo capturas en la transformacion y
        el costo sale con 25. Sirve para repartir el costo cuando de una misma tanda salen varios
        tamanos, y para no teclearlo cada vez.
      </p>

      <div className="space-y-1">
        <label htmlFor="extrasRecipeId" className="text-sm font-medium text-neutral-700">
          Agregados de cada porcion (opcional)
        </label>
        <select
          id="extrasRecipeId"
          name="extrasRecipeId"
          defaultValue={values?.extrasRecipeId ?? ""}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Sin agregados</option>
          {recipes.map((recipe) => (
            <option key={recipe.id} value={recipe.id}>
              {recipe.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Si cada porcion lleva sal, limon o bolsa, hazlos una receta con esos ingredientes y
          eligela aqui. Su costo se suma al de la porcion, y se actualiza solo cuando suba la
          bolsa.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="categoryId" className="text-sm font-medium text-neutral-700">
          Categoria (opcional)
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={values?.categoryId ?? ""}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Sin categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
        <Link href="/portioning/portions" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
