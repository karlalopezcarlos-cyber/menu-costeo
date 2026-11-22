"use client";

import { useActionState, useState } from "react";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/cfdi";
import { updateDatosFiscales } from "./actions";

export type SucursalFiscal = {
  id: string;
  name: string;
  isCentral: boolean;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscal: string | null;
  codigoPostalFiscal: string | null;
  usoCfdi: string | null;
  /** Lo que le falta para poder aparecer en una factura. Vacio = completa. */
  faltantes: string[];
};

const ETIQUETA = "block text-xs font-medium uppercase tracking-wider text-neutral-500";
const CAMPO = "mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm";

function FichaSucursal({ sucursal }: { sucursal: SucursalFiscal }) {
  const [abierta, setAbierta] = useState(sucursal.faltantes.length > 0);
  const [state, formAction, pending] = useActionState(
    updateDatosFiscales.bind(null, sucursal.id),
    undefined,
  );

  const completa = sucursal.faltantes.length === 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="font-medium text-neutral-900">{sucursal.name}</span>
          {sucursal.isCentral && (
            <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
              CEDIS
            </span>
          )}
          <span className="mt-0.5 block truncate text-xs text-neutral-500">
            {completa ? (
              <>
                {sucursal.rfc} · {sucursal.razonSocial}
              </>
            ) : (
              <span className="text-amber-700">Falta: {sucursal.faltantes.join(", ")}</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-neutral-400">{abierta ? "−" : "+"}</span>
      </button>

      {abierta && (
        <form action={formAction} className="space-y-4 border-t border-neutral-100 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`rfc-${sucursal.id}`} className={ETIQUETA}>
                RFC
              </label>
              <input
                id={`rfc-${sucursal.id}`}
                name="rfc"
                defaultValue={sucursal.rfc ?? ""}
                placeholder="ABC010101AB1"
                maxLength={13}
                className={`${CAMPO} uppercase`}
              />
            </div>
            <div>
              <label htmlFor={`cp-${sucursal.id}`} className={ETIQUETA}>
                Codigo postal fiscal
              </label>
              <input
                id={`cp-${sucursal.id}`}
                name="codigoPostalFiscal"
                defaultValue={sucursal.codigoPostalFiscal ?? ""}
                placeholder="44100"
                inputMode="numeric"
                maxLength={5}
                className={CAMPO}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`razon-${sucursal.id}`} className={ETIQUETA}>
              Razon social
            </label>
            <input
              id={`razon-${sucursal.id}`}
              name="razonSocial"
              defaultValue={sucursal.razonSocial ?? ""}
              placeholder="Tal cual la Constancia, con el regimen de capital"
              className={CAMPO}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Sin punto final y sin abreviar: el SAT la compara caracter por caracter.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`regimen-${sucursal.id}`} className={ETIQUETA}>
                Regimen fiscal
              </label>
              <select
                id={`regimen-${sucursal.id}`}
                name="regimenFiscal"
                defaultValue={sucursal.regimenFiscal ?? ""}
                className={CAMPO}
              >
                <option value="">Sin definir</option>
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`uso-${sucursal.id}`} className={ETIQUETA}>
                Uso del CFDI al recibir
              </label>
              <select
                id={`uso-${sucursal.id}`}
                name="usoCfdi"
                defaultValue={sucursal.usoCfdi ?? ""}
                className={CAMPO}
              >
                <option value="">Sin definir</option>
                {USOS_CFDI.map((u) => (
                  <option key={u.clave} value={u.clave}>
                    {u.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-400">
                Para mercancia que se revende, G01.
              </p>
            </div>
          </div>

          {state?.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state?.ok && !state.error && (
            <p className="text-sm text-emerald-700">Datos fiscales guardados.</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function DatosFiscalesManager({ sucursales }: { sucursales: SucursalFiscal[] }) {
  return (
    <div className="space-y-3">
      {sucursales.map((s) => (
        <FichaSucursal key={s.id} sucursal={s} />
      ))}
    </div>
  );
}
