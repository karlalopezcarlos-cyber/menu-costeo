"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSucursal, updateSucursal, toggleSucursalActive } from "./actions";

export type SucursalRow = {
  id: string;
  name: string;
  isCentral: boolean;
  isActive: boolean;
  userCount: number;
};

const initialState: { error?: string } = {};

function NewSucursalForm() {
  const [state, formAction, pending] = useActionState(createSucursal, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Nueva sucursal
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Ej. Sucursal Centro"
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

function EditSucursalForm({ sucursal, onDone }: { sucursal: SucursalRow; onDone: () => void }) {
  const action = updateSucursal.bind(null, sucursal.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="name"
        defaultValue={sucursal.name}
        required
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
      />
      <button type="submit" disabled={pending} className="text-sm text-neutral-700 hover:underline disabled:opacity-50">
        Guardar
      </button>
      <button type="button" onClick={onDone} className="text-sm text-neutral-500 hover:underline">
        Cancelar
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export default function SucursalesManager({ sucursales }: { sucursales: SucursalRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <NewSucursalForm />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Usuarios</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sucursales.map((s) => (
              <tr key={s.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {editingId === s.id ? (
                    <EditSucursalForm sucursal={s} onDone={() => setEditingId(null)} />
                  ) : (
                    <>
                      {s.name}
                      {s.isCentral && (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500">
                          CEDIS
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-4 py-2 text-neutral-500">{s.userCount}</td>
                <td className="px-4 py-2">
                  <span className={s.isActive ? "text-green-700" : "text-neutral-400"}>
                    {s.isActive ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {editingId !== s.id && (
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        className="text-neutral-400 hover:text-neutral-900"
                      >
                        Editar
                      </button>
                      {!s.isCentral && (
                        <button
                          type="button"
                          onClick={() => toggleSucursalActive(s.id, !s.isActive)}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          {s.isActive ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
