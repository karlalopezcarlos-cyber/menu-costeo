"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importPlu, type ImportPluState } from "./actions";

const initialState: ImportPluState = {};

export default function ImportPluForm({ sucursalName }: { sucursalName: string }) {
  const [state, formAction, pending] = useActionState(importPlu, initialState);

  if (state.result) {
    const { creados, actualizados, omitidos, categoriasNuevas, columnas } = state.result;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">Carga terminada</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li>
              {creados} {creados === 1 ? "PLU dado de alta" : "PLU dados de alta"} en{" "}
              {state.result.sucursalName}, con rendimiento 1 PZA
            </li>
            {actualizados > 0 && (
              <li>
                {actualizados}{" "}
                {actualizados === 1
                  ? "que ya existia, con precio y categoria nuevos"
                  : "que ya existian, con precio y categoria nuevos"}
              </li>
            )}
            {categoriasNuevas.length > 0 && (
              <li>
                {categoriasNuevas.length === 1 ? "Categoria creada" : "Categorias creadas"}:{" "}
                {categoriasNuevas.join(", ")}
              </li>
            )}
          </ul>
          {columnas && (
            <p className="mt-2 text-xs text-emerald-700">
              Se leyo &quot;{columnas.name}&quot; como el nombre, &quot;{columnas.price}&quot; como
              el precio y &quot;{columnas.category}&quot; como la categoria.
            </p>
          )}
          <p className="mt-3 border-t border-emerald-200 pt-3 text-xs text-emerald-700">
            Nacen sin receta y sin costo. El siguiente paso es capturarles los ingredientes, o
            ponerles el costo de golpe desde Recetas &gt; Cargar costos.
          </p>
        </div>

        {omitidos.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {omitidos.length}{" "}
              {omitidos.length === 1
                ? "ya existia en esta sucursal y se dejo igual"
                : "ya existian en esta sucursal y se dejaron igual"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              No se les toco el precio ni la categoria. Si el archivo trae los datos buenos,
              vuelve a subirlo marcando la casilla de actualizar.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-amber-800">
              {omitidos.map((o) => (
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
            href="/recipes/plu"
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
              <a
                href="/api/export/recipes/plu-template"
                className="font-medium text-brand-600 hover:underline"
              >
                Descarga la plantilla
              </a>{" "}
              — tres columnas: nombre, precio y categoria, con tus categorias ya en el
              desplegable.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
              2
            </span>
            <span>
              Vacia ahi tu menu y borra las dos filas de ejemplo. El rendimiento no se captura:
              todos entran con <b>1 PZA</b>.
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
          Tambien sirve el archivo que ya tengas del punto de venta, sin reacomodarlo: basta con
          que traiga un renglon de encabezados con el nombre del platillo, el precio y la
          categoria, en el orden que sea.
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
          <input type="checkbox" name="actualizarExistentes" className="mt-0.5" />
          <span>
            Actualizar los PLU que ya existan
            <span className="block text-xs text-neutral-500">
              Les pone el precio y la categoria del archivo. Sin marcar, se dejan como estan y te
              los reporto; asi un archivo con precios viejos no reescribe el menu entero.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Cargando..." : `Cargar PLU en ${sucursalName}`}
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
