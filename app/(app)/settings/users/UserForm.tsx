"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createUser, updateUser } from "./actions";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

export type EditableUser = {
  id: string;
  email: string;
  name: string | null;
  allowedPanels: Panel[];
  sucursalIds: string[];
};

const initialState: { error?: string } = {};

const TOGGLEABLE_PANELS = PANEL_DEFS.filter((p) => p.key !== "DASHBOARD");

export default function UserForm({
  editing,
  sucursales,
  onCancelEdit,
}: {
  editing: EditableUser | null;
  sucursales: { id: string; name: string }[];
  onCancelEdit: () => void;
}) {
  const action = editing ? updateUser.bind(null, editing.id) : createUser;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [allowedPanels, setAllowedPanels] = useState<Set<Panel>>(new Set(editing?.allowedPanels ?? []));
  const [selectedSucursales, setSelectedSucursales] = useState<Set<string>>(
    new Set(editing?.sucursalIds ?? []),
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error && editing) {
      onCancelEdit();
    }
    wasPending.current = pending;
  }, [pending, state, editing, onCancelEdit]);

  function togglePanel(panel: Panel) {
    setAllowedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  }

  function toggleSucursal(sucursalId: string) {
    setSelectedSucursales((prev) => {
      const next = new Set(prev);
      if (next.has(sucursalId)) next.delete(sucursalId);
      else next.add(sucursalId);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">
        {editing ? `Editar usuario: ${editing.email}` : "Nuevo usuario"}
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor="name" className="text-xs font-medium text-neutral-700">
            Nombre
          </label>
          <input
            id="name"
            name="name"
            defaultValue={editing?.name ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-medium text-neutral-700">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={editing?.email ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-medium text-neutral-700">
            {editing ? "Nueva contrasena (opcional)" : "Contrasena"}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required={!editing}
            placeholder={editing ? "Dejar en blanco para no cambiar" : ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-neutral-700">Sucursales a las que tiene acceso</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {sucursales.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                name="sucursalIds"
                value={s.id}
                checked={selectedSucursales.has(s.id)}
                onChange={() => toggleSucursal(s.id)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {s.name}
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-400">
          Puede marcar mas de una; el usuario podra cambiar entre ellas con un selector.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-neutral-700">Paneles que puede ver</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {TOGGLEABLE_PANELS.map((panel) => (
            <label key={panel.key} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                name="allowedPanels"
                value={panel.key}
                checked={allowedPanels.has(panel.key)}
                onChange={() => togglePanel(panel.key)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {panel.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-400">
          &quot;Panel&quot; (inicio) siempre esta disponible, no hace falta marcarlo.
        </p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : editing ? "Guardar cambios" : "Crear usuario"}
        </button>
        {editing && (
          <button type="button" onClick={onCancelEdit} className="text-sm text-neutral-500 hover:underline">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
