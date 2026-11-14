"use client";

import { useActionState, useState } from "react";
import { importInventoryCount, type ImportCountState } from "./actions";

const initialState: ImportCountState = {};

/**
 * Carga del conteo desde un Excel. Vive plegada dentro de la pantalla del conteo, no en una
 * ruta aparte: el conteo ya existe con su fecha y lo que falta es llenarlo, no empezar otro.
 */
export default function ImportCountForm({ countId }: { countId: string }) {
  const [abierto, setAbierto] = useState(false);
  const accion = importInventoryCount.bind(null, countId);
  const [state, formAction, pending] = useActionState(accion, initialState);

  if (!abierto && !state.result && !state.message && !state.errors) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      >
        Cargar desde Excel
      </button>
    );
  }

  return (
    <div className="w-full space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-neutral-900">Cargar el conteo desde Excel</p>
          <p className="mt-1 text-sm text-neutral-500">
            Una columna con el nombre del producto y otra con la cantidad contada. No importa en
            que fila empiecen. Solo se tocan los renglones que vengan en el archivo: lo demas se
            queda como esta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="shrink-0 text-sm text-neutral-400 hover:text-neutral-700"
        >
          Cerrar
        </button>
      </div>

      {state.result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              {state.result.cargados}{" "}
              {state.result.cargados === 1 ? "renglon cargado" : "renglones cargados"}
            </p>
            {state.result.columnas && (
              <p className="mt-1 text-xs text-emerald-700">
                Se leyo &quot;{state.result.columnas.name}&quot; como el producto y &quot;
                {state.result.columnas.cost}&quot; como la cantidad contada.
              </p>
            )}
          </div>

          {state.result.noPositivos.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-800">
                {state.result.noPositivos.length} en cero o en negativo, sin cargar
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Un conteo lee el cero como &quot;borra este renglon&quot;, y un inventario fisico
                negativo no es un conteo: es un descuadre del otro sistema. Si de verdad no hay
                nada de ese producto, dejalo sin capturar.
              </p>
              <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-neutral-600">
                {state.result.noPositivos.map((o) => (
                  <li key={o.excelRow}>
                    Fila {o.excelRow}: {o.name} ({o.cantidad})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.result.noEncontrados.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                {state.result.noEncontrados.length} sin producto en el catalogo
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Revisa que esten escritos igual, o dalos de alta en la carga masiva de productos y
                vuelve a subir el archivo.
              </p>
              <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-amber-800">
                {state.result.noEncontrados.map((o) => (
                  <li key={o.excelRow}>
                    Fila {o.excelRow}: {o.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-neutral-500">
            Recarga la pantalla para ver las cantidades en la tabla de abajo.
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
          />

          <div className="space-y-1">
            <label htmlFor="valueHeader" className="text-sm font-medium text-neutral-700">
              Columna de la cantidad <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              id="valueHeader"
              name="valueHeader"
              type="text"
              defaultValue={state.valueCandidates?.[0] ?? ""}
              placeholder="Se detecta sola; escribela solo si el archivo trae varias"
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
            {state.valueCandidates && state.valueCandidates.length > 0 && (
              <p className="text-xs text-neutral-500">
                En tu archivo hay: {state.valueCandidates.join(", ")}. Si viene de un punto de
                venta, la del conteo es la de &quot;fisico&quot;, no la de &quot;existencia&quot;:
                esa ultima es lo que el sistema creia que habia, y cargarla dejaria la auditoria
                en ceros.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Cargando..." : "Cargar conteo"}
          </button>

          {state.message && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {state.message}
            </p>
          )}

          {state.errors && state.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                No se cargo nada. Corrige y vuelve a subir el archivo:
              </p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm text-red-700">
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
      )}
    </div>
  );
}
