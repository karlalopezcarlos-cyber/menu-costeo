"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import PurchaseEditForm from "./PurchaseEditForm";
import { deletePurchase, deletePurchaseGroup } from "./actions";
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
  comment: string | null;
};

export default function PurchaseGroupManager({
  purchases,
  suppliers,
  recipeId,
  backHref,
  folio,
  folioLabel,
}: {
  purchases: GroupedPurchase[];
  suppliers: { id: string; name: string }[];
  recipeId: string | null;
  backHref: string;
  folio: number;
  folioLabel: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [blockedDelete, setBlockedDelete] = useState<{ message: string; paymentHref: string } | null>(null);

  const visiblePurchases = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? purchases.filter((p) => p.productName.toLowerCase().includes(term)) : purchases;
  }, [purchases, search]);

  return (
    <div className="space-y-3">
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
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {purchases.length > 0 && (
          <div className="border-b border-neutral-100 px-4 py-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full max-w-xs rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
            />
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Producto</th>
              <th className="px-4 py-2 font-medium text-right">Cantidad</th>
              <th className="px-4 py-2 font-medium text-right">Precio</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Costo resultante</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {purchases.length > 0 && visiblePurchases.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con la busqueda.
                </td>
              </tr>
            )}
            {visiblePurchases.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    {p.productName}
                    {p.note && <p className="mt-0.5 text-xs text-amber-600">{p.note}</p>}
                    {p.comment && <p className="mt-0.5 text-xs italic text-neutral-500">{p.comment}</p>}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-500">
                    {p.presentationQty} {UNIT_LABELS[p.presentationUnit]}
                  </td>
                  <td className="px-4 py-2 text-right">{formatMoney(p.totalPrice)}</td>
                  <td className="px-4 py-2 text-right text-neutral-700 whitespace-nowrap">
                    {formatMoney(p.computedUnitCost, 4)} / {UNIT_LABELS[p.baseUnit]}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                      className="text-neutral-400 hover:text-neutral-900"
                    >
                      {editingId === p.id ? "Cerrar" : "Editar"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${p.productName}" de esta compra? Esta accion no se puede deshacer.`)) {
                          return;
                        }
                        setBlockedDelete(null);
                        const result = await deletePurchase(p.id, recipeId);
                        if (result?.error) {
                          setBlockedDelete({ message: result.error, paymentHref: result.paymentHref ?? "/payments" });
                        }
                      }}
                      className="ml-3 text-neutral-400 hover:text-red-600"
                    >
                      Eliminar
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
                        comment={p.comment}
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

      <button
        type="button"
        onClick={async () => {
          if (
            !confirm(
              `¿Cancelar toda la compra ${folioLabel}? Se eliminaran los ${purchases.length} productos registrados. Esta accion no se puede deshacer.`,
            )
          ) {
            return;
          }
          setBlockedDelete(null);
          const result = await deletePurchaseGroup(folio, recipeId);
          if (result?.error) {
            setBlockedDelete({ message: result.error, paymentHref: result.paymentHref ?? "/payments" });
          }
        }}
        className="text-sm text-red-600 hover:underline"
      >
        Cancelar compra completa
      </button>
    </div>
  );
}
