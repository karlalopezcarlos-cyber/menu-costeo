"use client";

import { useActionState } from "react";
import {
  addSupplierPhone,
  deleteSupplierPhone,
  addSupplierEmail,
  deleteSupplierEmail,
} from "../actions";

const initialState: { error?: string } = {};

type ContactRow = { id: string; value: string; label: string | null };

function ContactList({
  title,
  description,
  placeholder,
  rows,
  addAction,
  deleteAction,
  inputType,
}: {
  title: string;
  description: string;
  placeholder: string;
  rows: ContactRow[];
  addAction: (
    prevState: { error?: string } | undefined,
    formData: FormData,
  ) => Promise<{ error?: string }>;
  deleteAction: (id: string) => Promise<void>;
  inputType: "tel" | "email";
}) {
  const [state, formAction, pending] = useActionState(addAction, initialState);

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      <p className="text-xs text-neutral-500">{description}</p>

      {rows.length > 0 && (
        <div className="divide-y divide-neutral-100 rounded-md border border-neutral-100">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {row.value}
                {row.label && <span className="text-neutral-400"> ({row.label})</span>}
              </span>
              <form action={deleteAction.bind(null, row.id)}>
                <button type="submit" className="text-neutral-400 hover:text-red-600" title="Borrar">
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2 pt-1">
        <div className="min-w-[9rem] flex-1 space-y-1">
          <input
            name={inputType === "tel" ? "phone" : "email"}
            type={inputType}
            placeholder={placeholder}
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="w-32 space-y-1">
          <input
            name="label"
            placeholder="Etiqueta (opcional)"
            className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {pending ? "Agregando..." : "+ Agregar"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </div>
  );
}

export default function SupplierContactsManager({
  supplierId,
  phones,
  emails,
}: {
  supplierId: string;
  phones: { id: string; phone: string; label: string | null }[];
  emails: { id: string; email: string; label: string | null }[];
}) {
  return (
    <div className="space-y-4">
      <ContactList
        title="Telefonos adicionales"
        description="El WhatsApp principal (el que se usa para enviar pedidos) se edita desde la lista de proveedores. Aqui puedes agregar numeros extra de referencia."
        placeholder="Ej. 5215512345678"
        rows={phones.map((p) => ({ id: p.id, value: p.phone, label: p.label }))}
        addAction={addSupplierPhone.bind(null, supplierId)}
        deleteAction={deleteSupplierPhone}
        inputType="tel"
      />
      <ContactList
        title="Correos adicionales"
        description="El correo principal (el que se usa para enviar pedidos) se edita desde la lista de proveedores. Aqui puedes agregar correos extra de referencia."
        placeholder="Ej. facturacion@proveedor.com"
        rows={emails.map((e) => ({ id: e.id, value: e.email, label: e.label }))}
        addAction={addSupplierEmail.bind(null, supplierId)}
        deleteAction={deleteSupplierEmail}
        inputType="email"
      />
    </div>
  );
}
