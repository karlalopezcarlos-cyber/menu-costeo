"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateOrgUser } from "./actions";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

export type EditableOrgUser = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "STAFF";
  allowedPanels: Panel[];
  sucursalId: string | null;
};

const initialState: { error?: string } = {};

const TOGGLEABLE_PANELS = PANEL_DEFS.filter((p) => p.key !== "DASHBOARD");

export default function OrgUserForm({
  organizationId,
  user,
  sucursales,
  onDone,
}: {
  organizationId: string;
  user: EditableOrgUser;
  sucursales: { id: string; name: string }[];
  onDone: () => void;
}) {
  const action = updateOrgUser.bind(null, organizationId, user.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [allowedPanels, setAllowedPanels] = useState<Set<Panel>>(new Set(user.allowedPanels));
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  function togglePanel(panel: Panel) {
    setAllowedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md bg-neutral-50 p-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor={`name-${user.id}`} className="text-xs font-medium text-neutral-700">
            Nombre
          </label>
          <input
            id={`name-${user.id}`}
            name="name"
            defaultValue={user.name ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`email-${user.id}`} className="text-xs font-medium text-neutral-700">
            Correo
          </label>
          <input
            id={`email-${user.id}`}
            name="email"
            type="email"
            required
            defaultValue={user.email}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`password-${user.id}`} className="text-xs font-medium text-neutral-700">
            Nueva contrasena
          </label>
          <input
            id={`password-${user.id}`}
            name="password"
            type="password"
            placeholder="Dejar en blanco para no cambiar"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {user.role !== "OWNER" && (
        <div className="max-w-xs space-y-1">
          <label htmlFor={`sucursalId-${user.id}`} className="text-xs font-medium text-neutral-700">
            Sucursal
          </label>
          <select
            id={`sucursalId-${user.id}`}
            name="sucursalId"
            required
            defaultValue={user.sucursalId ?? ""}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Selecciona una sucursal
            </option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {user.role !== "OWNER" && (
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
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
