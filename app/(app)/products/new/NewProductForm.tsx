"use client";

import { useActionState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS } from "@/lib/units";
import { createProduct } from "../actions";

const initialState: { error?: string } = {};

export default function NewProductForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createProduct, initialState);

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
          placeholder="Ej. Leche entera"
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
        <Link href="/settings/categories" className="text-xs text-neutral-500 hover:underline">
          Administrar categorias
        </Link>
      </div>

      <div className="space-y-1">
        <label htmlFor="baseUnit" className="text-sm font-medium text-neutral-700">
          Unidad base (en la que se miden las recetas)
        </label>
        <select
          id="baseUnit"
          name="baseUnit"
          required
          defaultValue="L"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="yieldPercentage" className="text-sm font-medium text-neutral-700">
          Rendimiento (%)
        </label>
        <input
          id="yieldPercentage"
          name="yieldPercentage"
          type="number"
          step="any"
          min="1"
          max="100"
          defaultValue={100}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          100% = sin merma. Si el producto rinde menos de lo que compras (ej. cilantro que pierde 20%
          al limpiarlo, o una lata donde solo aprovechas el neto), captura el % que realmente
          aprovechas y el costo se ajustara automaticamente al registrar compras.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-neutral-200 p-3">
        <p className="text-sm font-medium text-neutral-700">Presentacion de compra fija (opcional)</p>
        <p className="text-xs text-neutral-500">
          Si este producto se compra y se cuenta por pieza con un contenido fijo (ej. una botella
          de 750 ML, una caja de 12 piezas), captura aqui el nombre y el contenido. Podras comprar y
          contar inventario en piezas (&quot;1 botella&quot;) y el sistema seguira costeando en la
          unidad base.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="presentationUnitLabel" className="text-xs font-medium text-neutral-700">
              Nombre (ej. Botella)
            </label>
            <input
              id="presentationUnitLabel"
              name="presentationUnitLabel"
              placeholder="Botella"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="presentationUnitQty" className="text-xs font-medium text-neutral-700">
              Contenido (en la unidad base)
            </label>
            <input
              id="presentationUnitQty"
              name="presentationUnitQty"
              type="number"
              step="any"
              min="0"
              placeholder="750"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <Link href="/products" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
