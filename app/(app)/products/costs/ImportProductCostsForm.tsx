"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importProductCosts, type ImportProductCostsState } from "./actions";

const initialState: ImportProductCostsState = {};

export default function ImportProductCostsForm({ sucursalName }: { sucursalName: string }) {
  const [state, formAction, pending] = useActionState(importProductCosts, initialState);

  if (state.result) {
    const { guardados, sinCambio, noEncontrados, enCero, sospechosos, porUnidad, columnas, sucursalName: donde } =
      state.result;
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-emerald-900">
            Carga terminada en {donde}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li>
              {guardados} {guardados === 1 ? "producto con costo nuevo" : "productos con costo nuevo"} en{" "}
              {donde}
            </li>
            {sinCambio > 0 && <li>{sinCambio} ya tenian ese mismo costo aqui</li>}
          </ul>
          {columnas && (
            <p className="mt-2 text-xs text-emerald-700">
              Se leyo la columna &quot;{columnas.name}&quot; como el producto y &quot;{columnas.cost}
              &quot; como el costo.
            </p>
          )}
        </div>

        {porUnidad.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-800">Revisa que las unidades cuadren</p>
            <p className="mt-1 text-xs text-neutral-500">
              El costo se guardo por la unidad base que cada producto tiene en el catalogo. Si el
              archivo traia el precio por otra unidad, el numero quedo mal aunque la carga diga
              que salio bien.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-700">
              {porUnidad.map((u) => (
                <li key={u.unidad}>
                  <span className="font-medium">{u.cuantos}</span> por {u.unidad}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sospechosos.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {sospechosos.length}{" "}
              {sospechosos.length === 1 ? "costo quedo" : "costos quedaron"} por debajo de $1
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Casi siempre significa que el archivo traia el precio por otra unidad: $0.96 por
              mililitro es una botella de $672, pero $0.96 por litro es un error de mil veces.
              Revisa estos contra la unidad base que tienen en el catalogo.
            </p>
            <ul className="mt-2 max-h-60 overflow-y-auto text-sm text-amber-800">
              {sospechosos.map((p) => (
                <li key={p.name}>
                  {p.name}: ${p.costo} por {p.unidad}
                </li>
              ))}
            </ul>
          </div>
        )}

        {enCero.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-neutral-800">
              {enCero.length} {enCero.length === 1 ? "venia" : "venian"} en $0 y no se{" "}
              {enCero.length === 1 ? "guardo" : "guardaron"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Un cero no es un costo, es un dato que falta. Guardarlo dejaria esas recetas
              costeando en $0 sin que se notara. Ponles precio en el archivo y vuelve a subirlo.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-neutral-600">
              {enCero.map((o) => (
                <li key={o.excelRow}>
                  Fila {o.excelRow}: {o.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {noEncontrados.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-900">
              {noEncontrados.length}{" "}
              {noEncontrados.length === 1
                ? "nombre no existe en el catalogo y se omitio"
                : "nombres no existen en el catalogo y se omitieron"}
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Un costo necesita un producto donde vivir.{" "}
              <Link href="/products/import" className="font-medium underline">
                Dalos de alta en la carga masiva de productos
              </Link>{" "}
              y vuelve a subir este archivo.
            </p>
            <ul className="mt-2 max-h-60 overflow-y-auto text-sm text-amber-800">
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
            href="/products"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Ver el catalogo
          </Link>
          <Link
            href="/products/costs"
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          Los costos se van a guardar en <b>{sucursalName}</b>, y nada mas ahi. Si no es la
          sucursal que querias, cambiala arriba antes de subir el archivo.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-neutral-600">
          El archivo solo necesita dos columnas: uno con el <b>nombre del producto</b> (puede
          encabezarse Producto, Insumo, Articulo o Nombre) y otro con el <b>costo</b>. No importa
          en que fila empiecen ni que haya columnas de por medio. Lee <code>$1,250.50</code>, y lo
          que dejes vacio no se toca.
        </p>
        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          El costo va por la unidad base del producto, la que tenga en el catalogo. Los nombres
          que no existan se reportan: aqui no se dan de alta productos, porque un alta necesita
          unidad, categoria y rendimiento, y eso vive en la carga masiva de productos.
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

        <div className="space-y-1">
          <label htmlFor="costHeader" className="text-sm font-medium text-neutral-700">
            Columna de costo <span className="font-normal text-neutral-400">(opcional)</span>
          </label>
          <input
            id="costHeader"
            name="costHeader"
            type="text"
            defaultValue={state.costCandidates?.[0] ?? ""}
            placeholder="Se detecta sola; escribela solo si el archivo trae varias"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          {state.costCandidates && state.costCandidates.length > 0 && (
            <p className="text-xs text-neutral-500">
              En tu archivo hay: {state.costCandidates.join(", ")}.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Cargando..." : `Cargar costos en ${sucursalName}`}
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
