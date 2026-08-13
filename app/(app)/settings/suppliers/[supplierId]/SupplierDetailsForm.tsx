"use client";

import { useActionState } from "react";
import { updateSupplierDetails, type SupplierDetailsState } from "../actions";

const initialState: SupplierDetailsState = {};

export default function SupplierDetailsForm({
  supplierId,
  details,
}: {
  supplierId: string;
  details: {
    rfc: string | null;
    businessName: string | null;
    address: string | null;
    paymentMethod: string | null;
    contactName: string | null;
    bankInfo: string | null;
    creditDays: number | null;
    notes: string | null;
  };
}) {
  const boundAction = updateSupplierDetails.bind(null, supplierId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div>
        <p className="text-sm font-medium text-neutral-700">Informacion del proveedor</p>
        <p className="text-xs text-neutral-500">
          Todo este bloque es opcional e informativo: no afecta costeo ni calculos, solo se guarda
          para consulta y para el Excel de exportacion.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="businessName" className="text-sm font-medium text-neutral-700">
            Razon social
          </label>
          <input
            id="businessName"
            name="businessName"
            defaultValue={details.businessName ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="rfc" className="text-sm font-medium text-neutral-700">
            RFC
          </label>
          <input
            id="rfc"
            name="rfc"
            defaultValue={details.rfc ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="address" className="text-sm font-medium text-neutral-700">
          Direccion
        </label>
        <input
          id="address"
          name="address"
          defaultValue={details.address ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="contactName" className="text-sm font-medium text-neutral-700">
            Nombre de contacto
          </label>
          <input
            id="contactName"
            name="contactName"
            defaultValue={details.contactName ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="paymentMethod" className="text-sm font-medium text-neutral-700">
            Metodo de pago
          </label>
          <input
            id="paymentMethod"
            name="paymentMethod"
            placeholder="Ej. Transferencia, efectivo, cheque"
            defaultValue={details.paymentMethod ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="bankInfo" className="text-sm font-medium text-neutral-700">
            Banco / cuenta
          </label>
          <input
            id="bankInfo"
            name="bankInfo"
            placeholder="Ej. BBVA 0123456789, CLABE ..."
            defaultValue={details.bankInfo ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="creditDays" className="text-sm font-medium text-neutral-700">
            Dias de credito
          </label>
          <input
            id="creditDays"
            name="creditDays"
            type="number"
            min="0"
            step="1"
            defaultValue={details.creditDays ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="text-sm font-medium text-neutral-700">
          Notas
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={details.notes ?? ""}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Guardado.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
