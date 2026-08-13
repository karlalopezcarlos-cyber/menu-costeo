"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateSupplierContact, updateSupplierName, toggleSupplierActive, deleteSupplier } from "./actions";
import InlineNameEditor from "../InlineNameEditor";

const initialState: { error?: string; success?: boolean } = {};

export default function SupplierRow({
  supplier,
}: {
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    isActive: boolean;
    purchaseCount: number;
  };
}) {
  const boundUpdate = updateSupplierContact.bind(null, supplier.id);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);

  return (
    <tr className="border-t border-neutral-100 align-top">
      <td className="px-4 py-2">
        <InlineNameEditor id={supplier.id} initialName={supplier.name} action={updateSupplierName} />
        <div>
          <Link href={`/settings/suppliers/${supplier.id}`} className="text-xs text-neutral-500 hover:underline">
            Ver mas detalles
          </Link>
        </div>
      </td>
      <td className="px-4 py-2 text-neutral-500">{supplier.purchaseCount}</td>
      <td className="px-4 py-2">
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input
            name="phone"
            defaultValue={supplier.phone ?? ""}
            placeholder="WhatsApp: 5215512345678"
            className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <input
            name="email"
            type="email"
            defaultValue={supplier.email ?? ""}
            placeholder="correo@proveedor.com"
            className="w-48 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar"}
          </button>
          {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state?.success && <span className="text-xs text-emerald-700">Guardado</span>}
        </form>
      </td>
      <td className="px-4 py-2">
        <form action={toggleSupplierActive.bind(null, supplier.id, !supplier.isActive)}>
          <button
            type="submit"
            className={supplier.isActive ? "text-green-700 hover:underline" : "text-neutral-400 hover:underline"}
          >
            {supplier.isActive ? "Activo" : "Inactivo"}
          </button>
        </form>
      </td>
      <td className="px-4 py-2 text-right">
        <form action={deleteSupplier.bind(null, supplier.id)}>
          <button type="submit" className="text-neutral-400 hover:text-red-600">
            Borrar
          </button>
        </form>
      </td>
    </tr>
  );
}
