"use client";

import { useState } from "react";
import { updatePurchaseOrderItems } from "./actions";
import PresentationQuantityInput, {
  type PresentationOption,
} from "../../_components/PresentationQuantityInput";
import type { UnitValue } from "@/lib/units";

export type OrderItemRow = {
  id: string;
  productName: string;
  baseUnit: UnitValue;
  unitLabel: string;
  presentationLabel: string;
  quantity: number;
  comment: string;
  presentations: PresentationOption[];
};

type SupplierOption = { id: string; name: string };

export default function OrderItemsForm({
  orderId,
  rows,
  suppliers,
  initialSupplierId,
  initialComment,
}: {
  orderId: string;
  rows: OrderItemRow[];
  suppliers: SupplierOption[];
  initialSupplierId: string;
  initialComment: string;
}) {
  const [presentations, setPresentations] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.presentationLabel])),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, String(r.quantity)])),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.comment])),
  );
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [supplierId, setSupplierId] = useState(initialSupplierId);

  const boundSave = updatePurchaseOrderItems.bind(null, orderId);

  return (
    <form action={boundSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-1">
          <label htmlFor="supplierId" className="text-sm font-medium text-neutral-700">
            Proveedor (opcional)
          </label>
          <select
            id="supplierId"
            name="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
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
        <div className="space-y-1">
          <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
            Comentarios (opcional)
          </label>
          <textarea
            id="comment"
            name="comment"
            rows={1}
            defaultValue={initialComment}
            placeholder="Ej. entregar antes de las 10 am"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="px-4 py-2 font-medium">Cantidad</th>
              <th className="px-4 py-2 font-medium">Comentario</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Este pedido no tiene productos.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isRemoved = !!removed[row.id];
              return (
                <tr key={row.id} className={`border-t border-neutral-100 ${isRemoved ? "opacity-40" : ""}`}>
                  <td className="px-4 py-2">{row.productName}</td>
                  <td className="px-4 py-2">
                    <input
                      type="hidden"
                      name={`presentation:${row.id}`}
                      value={presentations[row.id] ?? row.presentationLabel}
                    />
                    <input
                      type="hidden"
                      name={`qty:${row.id}`}
                      value={isRemoved ? "0" : (quantities[row.id] ?? String(row.quantity))}
                    />
                    <PresentationQuantityInput
                      baseUnit={row.baseUnit}
                      unitLabel={row.unitLabel}
                      presentations={row.presentations}
                      value={quantities[row.id] ?? String(row.quantity)}
                      onChange={(qty) => setQuantities((prev) => ({ ...prev, [row.id]: qty }))}
                      onPresentationChange={(label) => {
                        if (label) setPresentations((prev) => ({ ...prev, [row.id]: label }));
                      }}
                      disabled={isRemoved}
                      multiPresentation
                      initialPresentationLabel={row.presentationLabel}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      name={`itemComment:${row.id}`}
                      value={comments[row.id] ?? row.comment}
                      onChange={(e) =>
                        setComments((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      disabled={isRemoved}
                      placeholder="Opcional"
                      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    {isRemoved ? (
                      <button
                        type="button"
                        onClick={() => setRemoved((prev) => ({ ...prev, [row.id]: false }))}
                        className="text-sm text-neutral-500 hover:underline"
                      >
                        Deshacer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoved((prev) => ({ ...prev, [row.id]: true }))}
                        className="text-neutral-400 hover:text-red-600"
                        title="Quitar del pedido"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar cambios
        </button>
      )}
    </form>
  );
}
