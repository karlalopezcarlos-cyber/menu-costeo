"use client";

import { useActionState } from "react";
import { createSupplier } from "./actions";

const initialState: { error?: string } = {};

export default function NewSupplierForm() {
  const [state, formAction, pending] = useActionState(createSupplier, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1 space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nuevo proveedor
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Ej. Central de Abastos, Sysco, Bimbo"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[9rem] flex-1 space-y-1">
          <label htmlFor="phone" className="text-sm font-medium text-neutral-700">
            WhatsApp (opcional)
          </label>
          <input
            id="phone"
            name="phone"
            placeholder="Ej. 5215512345678"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[10rem] flex-1 space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Correo (opcional)
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="Ej. pedidos@proveedor.com"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "Agregar"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
