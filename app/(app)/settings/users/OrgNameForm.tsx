"use client";

import { useActionState } from "react";
import { updateOrganizationName } from "./actions";

const initialState: { error?: string } = {};

export default function OrgNameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(updateOrganizationName, initialState);

  return (
    <form action={formAction} className="flex items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="max-w-xs flex-1 space-y-1">
        <label htmlFor="orgName" className="text-xs font-medium text-neutral-700">
          Nombre del negocio
        </label>
        <input
          id="orgName"
          name="name"
          defaultValue={name}
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Guardar"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
