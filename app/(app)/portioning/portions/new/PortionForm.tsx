"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PortionState } from "../actions";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";

export type ProductOption = { id: string; name: string; baseUnit: UnitValue };

export type PortionInitial = {
  name: string;
  parentProductId: string;
  parentQty: string;
  parentUnit: UnitValue;
  extras: { productId: string; qty: string; unit: UnitValue }[];
};

type Extra = { key: number; productId: string; qty: string; unit: UnitValue | "" };

const initialState: PortionState = {};

/** Unidades que tienen sentido para un producto: las de su mismo tipo (masa, volumen, pieza). */
function unitsFor(product: ProductOption | undefined): UnitValue[] {
  if (!product) return [...UNITS];
  const tipo = UNIT_META[product.baseUnit].type;
  return UNITS.filter((u) => UNIT_META[u].type === tipo);
}

export default function PortionForm({
  products,
  action,
  initial,
  submitLabel = "Crear porcion",
}: {
  products: ProductOption[];
  action: (state: PortionState | undefined, formData: FormData) => Promise<PortionState>;
  initial?: PortionInitial;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [parentProductId, setParentProductId] = useState(initial?.parentProductId ?? "");
  const [parentUnit, setParentUnit] = useState<UnitValue | "">(initial?.parentUnit ?? "");
  const [extras, setExtras] = useState<Extra[]>(
    initial?.extras.map((e, i) => ({ key: i + 1, ...e })) ?? [],
  );

  const parent = products.find((p) => p.id === parentProductId);
  const parentUnits = unitsFor(parent);

  return (
    <form action={formAction} onKeyDown={blockEnterSubmit} className="space-y-4">
      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nombre de la porcion
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={120}
            defaultValue={initial?.name ?? ""}
            placeholder="Ej. CAMARON 20 G"
            className="w-full max-w-md rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_120px_120px]">
          <div className="space-y-1">
            <label htmlFor="parentProductId" className="text-sm font-medium text-neutral-700">
              Sale de este producto
            </label>
            <select
              id="parentProductId"
              name="parentProductId"
              required
              value={parentProductId}
              onChange={(e) => {
                setParentProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                setParentUnit(p ? p.baseUnit : "");
              }}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <option value="">Elige el producto a granel</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({UNIT_LABELS[p.baseUnit]})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="parentQty" className="text-sm font-medium text-neutral-700">
              Lleva
            </label>
            <input
              id="parentQty"
              name="parentQty"
              type="number"
              step="0.0001"
              min="0"
              required
              defaultValue={initial?.parentQty ?? ""}
              placeholder="20"
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="parentUnit" className="text-sm font-medium text-neutral-700">
              Unidad
            </label>
            <select
              id="parentUnit"
              name="parentUnit"
              required
              value={parentUnit}
              onChange={(e) => setParentUnit(e.target.value as UnitValue)}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              {parentUnits.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Cuanto producto a granel lleva <b>una</b> porcion. De ahi sale la merma: si capturas 20 g
          y de un kilo salen 40 piezas, el sistema sabe que aprovechaste 800 g.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Otros ingredientes (opcional)</h2>
          <p className="text-xs text-neutral-500">
            Lo que se le agrega a cada porcion: sal, limon, la bolsa en la que se empaca. Su costo
            se suma al de la porcion.
          </p>
        </div>

        {extras.map((extra) => {
          const prod = products.find((p) => p.id === extra.productId);
          return (
            <div key={extra.key} className="grid grid-cols-[1fr_110px_110px_40px] items-end gap-2">
              <select
                name="extraProductId"
                value={extra.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setExtras((prev) =>
                    prev.map((x) =>
                      x.key === extra.key
                        ? { ...x, productId: e.target.value, unit: p ? p.baseUnit : "" }
                        : x,
                    ),
                  );
                }}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="">Elige el ingrediente</option>
                {products
                  .filter((p) => p.id !== parentProductId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <input
                name="extraQty"
                type="number"
                step="0.0001"
                min="0"
                value={extra.qty}
                onChange={(e) =>
                  setExtras((prev) => prev.map((x) => (x.key === extra.key ? { ...x, qty: e.target.value } : x)))
                }
                placeholder="1"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              />
              <select
                name="extraUnit"
                value={extra.unit}
                onChange={(e) =>
                  setExtras((prev) =>
                    prev.map((x) => (x.key === extra.key ? { ...x, unit: e.target.value as UnitValue } : x)),
                  )
                }
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                {unitsFor(prod).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setExtras((prev) => prev.filter((x) => x.key !== extra.key))}
                className="h-9 rounded-md border border-neutral-200 text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:text-red-600"
                aria-label="Quitar ingrediente"
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() =>
            setExtras((prev) => [
              ...prev,
              { key: prev.length === 0 ? 1 : Math.max(...prev.map((x) => x.key)) + 1, productId: "", qty: "", unit: "" },
            ])
          }
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          + Agregar ingrediente
        </button>
      </div>

      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
        <Link
          href="/portioning/portions"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
