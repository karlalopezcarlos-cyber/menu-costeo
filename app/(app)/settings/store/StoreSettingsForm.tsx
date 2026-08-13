"use client";

import { useActionState, useEffect, useState } from "react";
import { updateStoreSettings } from "./actions";

const initialState: { error?: string; success?: boolean } = {};

export default function StoreSettingsForm({
  storeSlug,
  storeEnabled,
}: {
  storeSlug: string;
  storeEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateStoreSettings, initialState);
  const [slug, setSlug] = useState(storeSlug);
  const [enabled, setEnabled] = useState(storeEnabled);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="space-y-1">
        <label htmlFor="storeSlug" className="text-sm font-medium text-neutral-700">
          Slug de tu tienda
        </label>
        <input
          id="storeSlug"
          name="storeSlug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="ej. mi-dark-kitchen"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          Tu link publico sera:{" "}
          <span className="font-mono text-neutral-700">
            {origin || "https://tu-dominio.com"}/store/{slug || "..."}
          </span>
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          name="storeEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Tienda habilitada (los clientes pueden ver el menu y hacer pedidos)
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">Configuracion guardada.</p>}

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
