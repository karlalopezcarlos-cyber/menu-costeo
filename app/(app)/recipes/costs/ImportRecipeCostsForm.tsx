"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importRecipeCosts, type ImportCostsState } from "./actions";

const initialState: ImportCostsState = {};

export default function ImportRecipeCostsForm() {
  const [state, formAction, pending] = useActionState(importRecipeCosts, initialState);

  if (state.result) {
    const { actualizados, creados, sinCambio, noEncontrados, columnas } = state.result;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">Carga terminada</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li>
              {actualizados} {actualizados === 1 ? "platillo con costo nuevo" : "platillos con costo nuevo"}
            </li>
            {creados > 0 && (
              <li>{creados} {creados === 1 ? "platillo dado de alta" : "platillos dados de alta"}</li>
            )}
            {sinCambio > 0 && (
              <li>{sinCambio} ya tenian ese mismo costo capturado</li>
            )}
          </ul>
          {columnas && (
            <p className="mt-2 text-xs text-emerald-700">
              Se leyo la columna &quot;{columnas.recipe}&quot; como el platillo y &quot;
              {columnas.cost}&quot; como el costo.
            </p>
          )}
        </div>

        {noEncontrados.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {noEncontrados.length}{" "}
              {noEncontrados.length === 1
                ? "nombre no existe como platillo y se omitio"
                : "nombres no existen como platillos y se omitieron"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Revisa que esten escritos igual que en Recetas. Si de verdad faltan, vuelve a subir
              el archivo marcando la casilla de darlos de alta.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-amber-800">
              {noEncontrados.map((o) => (
                <li key={o.excelRow}>
                  Fila {o.excelRow}: {o.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            href="/recipes"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Ver los platillos
          </Link>
          <Link
            href="/recipes/costs"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Cargar otro archivo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <ol className="space-y-3 text-sm text-neutral-600">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
              1
            </span>
            <span>
              <a href="/api/export/recipe-costs-template" className="font-medium text-brand-600 hover:underline">
                Descarga la plantilla
              </a>{" "}
              — ya trae todos tus platillos, lo que cuesta cada uno hoy y de donde sale ese costo.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
              2
            </span>
            <span>
              Llena la columna <b>Costo capturado</b>. Lo que dejes vacio se queda como estaba.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
              3
            </span>
            <span>Subela aqui. Si algo esta mal, no se guarda nada y te digo que fila corregir.</span>
          </li>
        </ol>
        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          Tambien sirve el archivo que ya tengas, sin reacomodarlo: basta con que una columna
          traiga el nombre del platillo y otra el costo. Si es un escandallo con una fila por
          ingrediente y el costo del platillo repetido, se toma una sola vez.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="space-y-1">
          <label htmlFor="file" className="text-sm font-medium text-neutral-700">
            Archivo de Excel
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input type="checkbox" name="crearFaltantes" className="mt-0.5" />
          <span>
            Dar de alta los platillos que no existan
            <span className="block text-xs text-neutral-500">
              Los crea como platillo de menu, de una pieza, con ese costo y sin receta. Sin
              marcar, se omiten y te los reporto; asi un nombre mal escrito no inventa un platillo
              nuevo.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Cargando..." : "Cargar costos"}
        </button>
      </div>

      {state.message && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </p>
      )}

      {state.errors && state.errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-800">
            No se cargo nada. Corrige{" "}
            {state.errors.length === 1 ? "este detalle" : `estos ${state.errors.length} detalles`} y
            vuelve a subir el archivo:
          </p>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-red-700">
            {state.errors.map((e, i) => (
              <li key={`${e.excelRow}-${i}`}>
                {e.excelRow > 0 ? <b>Fila {e.excelRow}: </b> : null}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
