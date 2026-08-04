"use client";

import { Fragment, useState } from "react";
import PurchaseEditForm from "./PurchaseEditForm";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";

export type GroupedPurchase = {
  id: string;
  productName: string;
  baseUnit: UnitValue;
  yieldPercentage: string;
  purchaseDate: string;
  presentationQty: string;
  presentationUnit: UnitValue;
  totalPrice: number;
  computedUnitCost: number;
  supplierId: string;
  note: string | null;
};

export default function PurchaseGroupManager({
  purchases,
  suppliers,
  recipeId,
  backHref,
}: {
  purchases: GroupedPurchase[];
  suppliers: { id: string; name: string }[];
  recipeId: string | null;
  backHref: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Producto</th>
            <th className="px-4 py-2 font-medium text-right">Cantidad</th>
            <th className="px-4 py-2 font-medium text-right">Precio</th>
            <th className="px-4 py-2 font-medium text-right">Costo resultante</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <Fragment key={p.id}>
              <tr className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {p.productName}
                  {p.note && <p className="mt-0.5 text-xs text-amber-600">{p.note}</p>}
                </td>
                <td className="px-4 py-2 text-right text-neutral-500">
                  {p.presentationQty} {UNIT_LABELS[p.presentationUnit]}
                </td>
                <td className="px-4 py-2 text-right">{formatMoney(p.totalPrice)}</td>
                <td className="px-4 py-2 text-right text-neutral-700">
                  {formatMoney(p.computedUnitCost, 4)} / {UNIT_LABELS[p.baseUnit]}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                    className="text-neutral-400 hover:text-neutral-900"
                  >
                    {editingId === p.id ? "Cerrar" : "Editar"}
                  </button>
                </td>
              </tr>
              {editingId === p.id && (
                <tr className="border-t border-neutral-100 bg-neutral-50">
                  <td colSpan={5} className="px-4 py-3">
                    <PurchaseEditForm
                      purchaseId={p.id}
                      productName={p.productName}
                      baseUnit={p.baseUnit}
                      yieldPercentage={p.yieldPercentage}
                      purchaseDate={p.purchaseDate}
                      presentationQty={p.presentationQty}
                      presentationUnit={p.presentationUnit}
                      totalPrice={p.totalPrice.toString()}
                      supplierId={p.supplierId}
                      suppliers={suppliers}
                      note={p.note}
                      recipeId={recipeId}
                      backHref={backHref}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
