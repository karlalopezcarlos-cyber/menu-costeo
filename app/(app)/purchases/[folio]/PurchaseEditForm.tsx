"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { applyYieldFactor, computeUnitCost, UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { updatePurchase, deletePurchase } from "./actions";
import { formatMoney } from "@/lib/format";

type SupplierOption = { id: string; name: string };

const initialState: { error?: string } = {};

export default function PurchaseEditForm({
  purchaseId,
  productName,
  baseUnit,
  yieldPercentage,
  purchaseDate,
  presentationQty,
  presentationUnit,
  totalPrice,
  supplierId,
  suppliers,
  note,
  comment,
  recipeId,
  backHref,
}: {
  purchaseId: string;
  productName: string;
  baseUnit: UnitValue;
  yieldPercentage: string;
  purchaseDate: string;
  presentationQty: string;
  presentationUnit: UnitValue;
  totalPrice: string;
  supplierId: string;
  suppliers: SupplierOption[];
  note: string | null;
  comment: string | null;
  recipeId: string | null;
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState(updatePurchase, initialState);
  const [qty, setQty] = useState(presentationQty);
  const [unit, setUnit] = useState<UnitValue>(presentationUnit);
  const [price, setPrice] = useState(totalPrice);
  const [blockedDelete, setBlockedDelete] = useState<{ message: string; paymentHref: string } | null>(null);

  let preview: Decimal | null = null;
  if (UNIT_META[unit].type === UNIT_META[baseUnit].type) {
    try {
      const qtyDecimal = new Decimal(qty || 0);
      const priceDecimal = new Decimal(price || 0);
      if (qtyDecimal.gt(0) && priceDecimal.gt(0)) {
        const gross = computeUnitCost(priceDecimal, qtyDecimal, unit, baseUnit);
        preview = applyYieldFactor(gross, yieldPercentage);
      }
    } catch {
      preview = null;
    }
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
        <input type="hidden" name="purchaseId" value={purchaseId} />
        {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}

        <div>
          <p className="text-sm font-medium text-neutral-700">Producto</p>
          <p className="text-sm text-neutral-500">{productName}</p>
        </div>

        {note && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{note}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="purchaseDate" className="text-sm font-medium text-neutral-700">
              Fecha
            </label>
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              required
              defaultValue={purchaseDate}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="supplierId" className="text-sm font-medium text-neutral-700">
              Proveedor
            </label>
            <select
              id="supplierId"
              name="supplierId"
              defaultValue={supplierId}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="presentationQty" className="text-sm font-medium text-neutral-700">
              Cantidad
            </label>
            <input
              id="presentationQty"
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
            <label htmlFor="presentationUnit" className="text-sm font-medium text-neutral-700">
              Unidad
            </label>
            <select
              id="presentationUnit"
              name="presentationUnit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as UnitValue)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {UNITS.map((u) => (
                <option key={u} value={u} disabled={UNIT_META[u].type !== UNIT_META[baseUnit].type}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="totalPrice" className="text-sm font-medium text-neutral-700">
              Precio
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                $
              </span>
              <input
                id="totalPrice"
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
        </div>

        <p className="text-sm text-neutral-700">
          Costo resultante:{" "}
          <strong>{preview ? `${formatMoney(preview.toNumber(), 4)} / ${UNIT_LABELS[baseUnit]}` : "-"}</strong>
        </p>

        <div className="space-y-1">
          <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
            Comentario
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={2}
            defaultValue={comment ?? ""}
            placeholder="Opcional"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
          <Link href={backHref} className="text-sm text-neutral-500 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>

      {blockedDelete && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{blockedDelete.message}</p>
          <Link
            href={blockedDelete.paymentHref}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
          >
            Ir a Pagos
          </Link>
        </div>
      )}

      <button
        type="button"
        onClick={async () => {
          if (!confirm("¿Eliminar esta compra? Esta accion no se puede deshacer.")) return;
          setBlockedDelete(null);
          const result = await deletePurchase(purchaseId, recipeId);
          if (result?.error) {
            setBlockedDelete({ message: result.error, paymentHref: result.paymentHref ?? "/payments" });
          }
        }}
        className="text-sm text-red-600 hover:underline"
      >
        Eliminar compra
      </button>
    </div>
  );
}
