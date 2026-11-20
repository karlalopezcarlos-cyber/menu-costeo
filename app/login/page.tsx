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
      {/* Dos luces tibias detras del sello, para que el negro no quede plano. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-brand-500/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-52 right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-brand-700/14 blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <FondoSeal size={148} tone="dark" />
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.34em] text-brand-400">
            Control · Rentabilidad · Estrategia
          </p>
          <p className="mt-3 text-sm text-neutral-400">
            Soluciones integrales para{" "}
            <span className="text-neutral-200">negocios de alimentos</span>
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
              className="w-full rounded-lg border border-white/10 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-brand-400/60 focus:ring-1 focus:ring-brand-400/40"
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
              className="w-full rounded-lg border border-white/10 bg-neutral-900/80 px-3.5 py-2.5 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-brand-400/60 focus:ring-1 focus:ring-brand-400/40"
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
            className="w-full rounded-lg bg-gradient-to-b from-brand-300 to-brand-500 px-3.5 py-2.5 text-sm font-semibold tracking-wide text-neutral-950 shadow-lg shadow-brand-900/40 transition-opacity hover:opacity-95 disabled:opacity-50"
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
