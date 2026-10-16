"use client";

import { useActionState } from "react";
import { updatePurchaseHeader } from "./actions";

type SupplierOption = { id: string; name: string };

const initialState: { error?: string } = {};

/**
 * Datos de la factura: proveedor, fecha y folio del documento del proveedor. Aplican a todos
 * los renglones del folio.
 */
export default function PurchaseHeaderForm({
  folio,
  purchaseDate,
  supplierId,
  invoiceFolio,
  suppliers,
  paidAmountLabel,
  paymentHref,
}: {
  folio: number;
  purchaseDate: string;
  supplierId: string;
  invoiceFolio: string;
  suppliers: SupplierOption[];
  /** Si la compra ya tiene abonos, no se puede editar: se explica y se bloquea. */
  paidAmountLabel: string | null;
  paymentHref: string | null;
}) {
  const [state, formAction, pending] = useActionState(updatePurchaseHeader, initialState);

  if (paidAmountLabel) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Esta compra ya tiene {paidAmountLabel} abonados, asi que sus datos no se pueden editar.
        {paymentHref && (
          <>
            {" "}
            Si necesitas corregirla, quita el pago en{" "}
            <a href={paymentHref} className="font-medium underline">
              Pagos
            </a>{" "}
            y vuelve aqui.
          </>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="folio" value={folio} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="headerSupplier" className="text-xs font-medium text-neutral-500">
            Proveedor
          </label>
          <select
            id="headerSupplier"
            name="supplierId"
            defaultValue={supplierId}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
          <label htmlFor="headerDate" className="text-xs font-medium text-neutral-500">
            Fecha
          </label>
          <input
            id="headerDate"
            name="purchaseDate"
            type="date"
            required
            defaultValue={purchaseDate}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="headerInvoice" className="text-xs font-medium text-neutral-500">
            Folio de factura
          </label>
          <input
            id="headerInvoice"
            name="invoiceFolio"
            type="text"
            maxLength={60}
            defaultValue={invoiceFolio}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar datos de la factura"}
        </button>
        <span className="text-xs text-neutral-500">Aplica a todos los productos de esta compra.</span>
      </div>
    </form>
  );
}
