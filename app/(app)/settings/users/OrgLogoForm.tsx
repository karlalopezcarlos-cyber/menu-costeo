"use client";

import { useActionState, useRef, useState } from "react";
import { removeOrgLogo, updateOrgLogo } from "./actions";

const initialState: { error?: string } = {};

export default function OrgLogoForm({ hasLogo, updatedAt }: { hasLogo: boolean; updatedAt: number }) {
  const [state, formAction, pending] = useActionState(updateOrgLogo, initialState);
  const [removing, setRemoving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-start gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      {hasLogo ? (
        <img
          src={`/api/organization/logo?v=${updatedAt}`}
          alt="Logo de la empresa"
          className="h-20 w-20 shrink-0 rounded-lg border border-neutral-200 object-contain p-1"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
          Sin logo
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-medium text-neutral-700">Logo de la empresa</p>
        <p className="text-xs text-neutral-500">
          Se usa como marca de agua de fondo en todos los PDFs que se exportan (recetas, compras,
          pedidos, auditoria, etc).
        </p>

        <form ref={formRef} action={formAction} className="flex items-center gap-2 pt-1">
          <input
            type="file"
            name="logo"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={() => formRef.current?.requestSubmit()}
            className="text-xs text-neutral-500 file:mr-2 file:rounded file:border-0 file:bg-neutral-100 file:px-2 file:py-1 file:text-xs"
          />
          {pending && <span className="text-xs text-neutral-500">Subiendo...</span>}
        </form>
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

        {hasLogo && (
          <button
            type="button"
            disabled={removing}
            onClick={async () => {
              setRemoving(true);
              await removeOrgLogo();
              setRemoving(false);
            }}
            className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
          >
            {removing ? "Quitando..." : "Quitar logo"}
          </button>
        )}
      </div>
    </div>
  );
}
