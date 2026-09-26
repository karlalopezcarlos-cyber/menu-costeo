"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

const initialState: { error?: string } = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(authenticate, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white shadow-sm p-6"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-500 text-base font-semibold text-white">
              F
            </span>
            <span className="text-[17px] font-semibold uppercase tracking-[0.22em] text-neutral-900">
              Fondo
            </span>
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-neutral-900">Iniciar sesion</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Costeo, inventario y control de operacion
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700">
            Contrasena
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
