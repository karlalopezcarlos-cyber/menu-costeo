"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { addPurchaseOrderItem } from "./actions";
import SearchableSelect from "../../_components/SearchableSelect";
import PresentationQuantityInput, {
  type PresentationOption,
} from "../../_components/PresentationQuantityInput";
import type { UnitValue } from "@/lib/units";

export type CandidateProduct = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  unitLabel: string;
  currentStock: number;
  targetStock: number;
  presentations: PresentationOption[];
};

const initialState: { error?: string; success?: boolean } = {};

export default function AddProductToOrder({
  orderId,
  candidates,
}: {
  orderId: string;
  candidates: CandidateProduct[];
}) {
  const boundAction = addPurchaseOrderItem.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [presentationLabel, setPresentationLabel] = useState<string | null>(null);

  const options = useMemo(() => candidates.map((c) => ({ id: c.id, label: c.name })), [candidates]);
  const product = candidates.find((c) => c.id === productId) ?? null;
  const shortfall = product ? Math.max(product.targetStock - product.currentStock, 0) : 0;

  useEffect(() => {
    if (state?.success) {
      setProductId("");
      setQuantity("");
      setPresentationLabel(null);
    }
  }, [state]);

  function handleSelectProduct(id: string) {
    setProductId(id);
    setPresentationLabel(null);
    const next = candidates.find((c) => c.id === id) ?? null;
    if (next) {
      const nextShortfall = Math.max(next.targetStock - next.currentStock, 0);
      setQuantity(nextShortfall > 0 ? String(nextShortfall) : "");
    } else {
      setQuantity("");
    }
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-700">Agregar producto al pedido</h2>
      <input type="hidden" name="presentationLabel" value={presentationLabel ?? ""} />
      <input type="hidden" name="quantity" value={quantity} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-64">
          <SearchableSelect
            name="productId"
            options={options}
            value={productId}
            onChange={handleSelectProduct}
            placeholder="Buscar producto..."
          />
        </div>
        {product && (
          <>
            <PresentationQuantityInput
              baseUnit={product.baseUnit}
              unitLabel={product.unitLabel}
              presentations={product.presentations}
              value={quantity}
              onChange={setQuantity}
              onPresentationChange={setPresentationLabel}
              multiPresentation
            />
            <button
              type="submit"
              disabled={pending || !quantity}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {pending ? "Agregando..." : "Agregar"}
            </button>
          </>
        )}
      </div>
      {product && product.targetStock > 0 && shortfall === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Hay tanto de este producto: {product.currentStock} {product.unitLabel} en stock (objetivo{" "}
          {product.targetStock} {product.unitLabel}). No hace falta pedirlo, pero puedes agregarlo
          manualmente si lo necesitas.
        </p>
      )}
      {product && product.targetStock === 0 && (
        <p className="text-sm text-neutral-500">
          Stock actual: {product.currentStock} {product.unitLabel} (este producto no tiene stock
          objetivo configurado).
        </p>
      )}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
