"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";
import { FondoSeal } from "@/components/brand/FondoLogo";

const initialState: { error?: string } = {};

/**
 * Acceso.
 *
 * La unica pantalla de la app en negro, porque es la unica que ve alguien que todavia no es
 * cliente. El oro de la marca (#d4af37, brand-400) solo funciona sobre negro -sobre blanco da
 * 2.1:1 de contraste y es ilegible-, asi que aqui es donde la identidad se puede usar entera.
 * Adentro la app sigue clara: son jornadas de ocho horas mirando tablas de numeros.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(authenticate, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-4 py-10">
      {/* Un aclarado neutro arriba, nada mas para que el negro no quede plano. Sin color:
          teñir el fondo de ambar hacia que la pantalla se leyera como adorno y no como acceso. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-gradient-to-b from-white/[0.05] to-transparent"
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <FondoSeal size={148} tone="dark" />
          <div className="mt-5 h-px w-28 bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.34em] text-neutral-400">
            Control <span className="text-brand-500">·</span> Rentabilidad{" "}
            <span className="text-brand-500">·</span> Estrategia
          </p>
          <p className="mt-3 text-sm text-neutral-500">
            Soluciones integrales para negocios de alimentos
          </p>
        </div>

        <form
          action={formAction}
          className="mt-9 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-sm"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-white/10 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-600"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              Contrasena
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-white/10 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-600"
            />
          </div>

          {state?.error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-neutral-100 px-3.5 py-2.5 text-sm font-semibold tracking-wide text-neutral-950 transition-colors hover:bg-white disabled:opacity-50"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs text-neutral-500">
          Costeo, inventario y control de operacion
        </p>
      </div>
    </div>
  );
}
