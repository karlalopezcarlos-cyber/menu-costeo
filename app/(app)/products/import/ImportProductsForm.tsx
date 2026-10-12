"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importProducts, type ImportState } from "./actions";

const initialState: ImportState = {};

export default function ImportProductsForm() {
  const [state, formAction, pending] = useActionState(importProducts, initialState);

  if (state.result) {
    const { creados, actualizados, omitidos, categoriasNuevas } = state.result;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">Carga terminada</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li>{creados} {creados === 1 ? "producto creado" : "productos creados"}</li>
            {actualizados > 0 && (
              <li>{actualizados} {actualizados === 1 ? "producto actualizado" : "productos actualizados"}</li>
            )}
            {categoriasNuevas.length > 0 && (
              <li>{categoriasNuevas.length} categorias creadas: {categoriasNuevas.join(", ")}</li>
            )}
          </ul>
        </div>

        {omitidos.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {omitidos.length} {omitidos.length === 1 ? "producto ya existia y se omitio" : "productos ya existian y se omitieron"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Si querias reemplazar sus datos, vuelve a subir el archivo marcando la casilla de actualizar.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-amber-800">
              {omitidos.map((o) => (
                <li key={o.excelRow}>Fila {o.excelRow}: {o.name}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Ver el catalogo
          </Link>
          <Link href="/products/import" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
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
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">1</span>
            <span>
              <a href="/api/export/products/template" className="font-medium text-brand-600 hover:underline">
                Descarga la plantilla
              </a>{" "}
              — ya trae tus categorias y las unidades validas en menus desplegables.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">2</span>
            <span>Llenala. Borra las dos filas de ejemplo que vienen en gris. La hoja <b>Instrucciones</b> explica cada columna.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">3</span>
            <span>Subela aqui. Si algo esta mal, no se guarda nada y te digo que fila corregir.</span>
          </li>
        </ol>
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
          <input type="checkbox" name="actualizarExistentes" className="mt-0.5" />
          <span>
            Actualizar los productos que ya existen
            <span className="block text-xs text-neutral-500">
              Reemplaza categoria, unidad base, rendimiento, presentacion y stock objetivo de los que coincidan por nombre.
              Sin marcar, esos productos se omiten y te los reporto.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Cargando..." : "Cargar productos"}
        </button>
      </div>

      {state.message && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.message}</p>
      )}

      {state.errors && state.errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-800">
            No se cargo nada. Corrige {state.errors.length === 1 ? "este detalle" : `estos ${state.errors.length} detalles`} y vuelve a subir el archivo:
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
