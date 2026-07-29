"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { updateProduct } from "../../actions";

const initialState: { error?: string } = {};

export default function EditProductForm({
  product,
  categories,
}: {
  product: {
    id: string;
    name: string;
    categoryId: string | null;
    baseUnit: UnitValue;
    yieldPercentage: string;
    presentationUnitLabel: string | null;
    presentationUnitQty: string | null;
  };
  categories: { id: string; name: string }[];
}) {
  const updateProductWithId = updateProduct.bind(null, product.id);
  const [state, formAction, pending] = useActionState(updateProductWithId, initialState);
  const [baseUnit, setBaseUnit] = useState<UnitValue>(product.baseUnit);
  const typeChanged = UNIT_META[baseUnit].type !== UNIT_META[product.baseUnit].type;

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
          defaultValue={product.name}
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
          defaultValue={product.categoryId ?? ""}
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
          Unidad base
        </label>
        <select
          id="baseUnit"
          name="baseUnit"
          required
          value={baseUnit}
          onChange={(e) => setBaseUnit(e.target.value as UnitValue)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {UNIT_LABELS[unit]}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500">
          Si cambias la unidad, las compras y los ingredientes de receta que usan este producto se
          recalculan automaticamente para seguir costeando correctamente.
        </p>
        {typeChanged && (
          <p className="text-xs text-amber-600">
            Estas cambiando entre tipos de unidad distintos (masa, volumen o pieza). Si hay compras
            registradas en un tipo incompatible con {UNIT_LABELS[baseUnit]}, el cambio se rechazara.
          </p>
        )}
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
          defaultValue={product.yieldPercentage}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          100% = sin merma. Ajusta el costo de las siguientes compras que registres para este
          producto.
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
              defaultValue={product.presentationUnitLabel ?? ""}
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
              defaultValue={product.presentationUnitQty ?? ""}
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
