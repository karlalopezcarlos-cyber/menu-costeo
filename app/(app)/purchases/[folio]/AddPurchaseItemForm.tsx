"use client";

import { useActionState, useState } from "react";
import Decimal from "decimal.js";
import { applyYieldFactor, computeUnitCost, UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { addPurchaseItem } from "./actions";
import { formatMoney } from "@/lib/format";

export type ProductOption = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  yieldPercentage: string;
};

const initialState: { error?: string } = {};

export default function AddPurchaseItemForm({
  folio,
  products,
  recipeId,
}: {
  folio: number;
  products: ProductOption[];
  recipeId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addPurchaseItem.bind(null, folio), initialState);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<UnitValue>(products[0]?.baseUnit ?? "KG");
  const [price, setPrice] = useState("");

  const product = products.find((p) => p.id === productId) ?? null;

  function handleProductChange(id: string) {
    setProductId(id);
    const next = products.find((p) => p.id === id);
    if (next) setUnit(next.baseUnit);
  }

  let preview: Decimal | null = null;
  if (product && UNIT_META[unit].type === UNIT_META[product.baseUnit].type) {
    try {
      const qtyDecimal = new Decimal(qty || 0);
      const priceDecimal = new Decimal(price || 0);
      if (qtyDecimal.gt(0) && priceDecimal.gt(0)) {
        const gross = computeUnitCost(priceDecimal, qtyDecimal, unit, product.baseUnit);
        preview = applyYieldFactor(gross, product.yieldPercentage);
      }
    } catch {
      preview = null;
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-neutral-900 hover:underline"
      >
        + Agregar producto a esta compra
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
    >
      {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1">
          <label htmlFor="new-productId" className="text-sm font-medium text-neutral-700">
            Producto
          </label>
          <select
            id="new-productId"
            name="productId"
            required
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="new-presentationQty" className="text-sm font-medium text-neutral-700">
            Cantidad
          </label>
          <input
            id="new-presentationQty"
            name="presentationQty"
            type="number"
            step="any"
            min="0"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-presentationUnit" className="text-sm font-medium text-neutral-700">
            Unidad
          </label>
          <select
            id="new-presentationUnit"
            name="presentationUnit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as UnitValue)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {UNITS.map((u) => (
              <option key={u} value={u} disabled={!product || UNIT_META[u].type !== UNIT_META[product.baseUnit].type}>
                {UNIT_LABELS[u]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label htmlFor="new-totalPrice" className="text-sm font-medium text-neutral-700">
            Precio
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              $
            </span>
            <input
              id="new-totalPrice"
              name="totalPrice"
              type="number"
              step="any"
              min="0"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
            />
          </div>
        </div>
        <div className="col-span-3 flex items-end">
          <p className="text-sm text-neutral-700">
            Costo resultante:{" "}
            <strong>
              {preview && product ? `${formatMoney(preview.toNumber(), 4)} / ${UNIT_LABELS[product.baseUnit]}` : "-"}
            </strong>
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="new-comment" className="text-sm font-medium text-neutral-700">
          Comentario
        </label>
        <textarea
          id="new-comment"
          name="comment"
          rows={2}
          placeholder="Opcional"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "Agregar a la compra"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
