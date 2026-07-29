"use client";

import { useActionState } from "react";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { addProductPresentation, deleteProductPresentation } from "../../actions";

const initialState: { error?: string } = {};

export type PresentationRow = {
  id: string;
  label: string;
  quantity: string;
  unit: UnitValue;
};

export default function ProductPresentationsManager({
  productId,
  baseUnit,
  presentations,
}: {
  productId: string;
  baseUnit: UnitValue;
  presentations: PresentationRow[];
}) {
  const boundAdd = addProductPresentation.bind(null, productId);
  const [state, formAction, pending] = useActionState(boundAdd, initialState);

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-700">Presentaciones (opcional)</p>
      <p className="text-xs text-neutral-500">
        Define las formas en que se compra/pide este producto (ej. &quot;Lata 2.75kg&quot; = 2.75
        KG, &quot;Bulto 25kg&quot; = 25 KG). En Pedidos, Compras e Inventario podras elegir la
        presentacion e indicar cuantas piezas, y el sistema calcula la cantidad en{" "}
        {UNIT_LABELS[baseUnit]} automaticamente.
      </p>

      {presentations.length > 0 && (
        <div className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
          {presentations.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {p.label} = {Number(p.quantity)} {UNIT_LABELS[p.unit]}
              </span>
              <form action={deleteProductPresentation.bind(null, p.id)}>
                <button type="submit" className="text-neutral-400 hover:text-red-600" title="Borrar">
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2 pt-1">
        <div className="min-w-[8rem] flex-1 space-y-1">
          <label htmlFor="presLabel" className="text-xs font-medium text-neutral-700">
            Nombre
          </label>
          <input
            id="presLabel"
            name="label"
            placeholder="Lata 2.75kg"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="w-24 space-y-1">
          <label htmlFor="presQty" className="text-xs font-medium text-neutral-700">
            Cantidad
          </label>
          <input
            id="presQty"
            name="quantity"
            type="number"
            step="any"
            min="0"
            placeholder="2.75"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="w-24 space-y-1">
          <label htmlFor="presUnit" className="text-xs font-medium text-neutral-700">
            Unidad
          </label>
          <select
            id="presUnit"
            name="unit"
            defaultValue={baseUnit}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "+ Agregar"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </div>
  );
}
