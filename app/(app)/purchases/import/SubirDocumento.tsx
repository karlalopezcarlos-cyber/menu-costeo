"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { leerDocumento, type LeerState } from "./actions";
import RevisarCompra from "./RevisarCompra";
import type { OpcionProducto, OpcionProveedor } from "@/lib/compras/importar-tipos";

const initialState: LeerState = {};

type Modo = "xml" | "foto";

export default function SubirDocumento({
  productos,
  proveedores,
  iaDisponible,
}: {
  productos: OpcionProducto[];
  proveedores: OpcionProveedor[];
  iaDisponible: boolean;
}) {
  const [state, formAction, pending] = useActionState(leerDocumento, initialState);
  const [modo, setModo] = useState<Modo>("xml");

  if (state.compra) {
    return (
      <RevisarCompra
        compra={state.compra}
        productos={productos}
        proveedores={proveedores}
        // Recargar deja la pantalla limpia sin arrastrar lo ya corregido. useActionState no
        // se puede vaciar sin inventar una accion de adorno que viaje al servidor para nada.
        onDescartar={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModo("xml")}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            modo === "xml"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          XML de factura
        </button>
        <button
          type="button"
          onClick={() => setModo("foto")}
          className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            modo === "foto"
              ? "bg-neutral-900 text-white shadow-sm"
              : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          Foto de la nota
        </button>
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="modo" value={modo} />

        {modo === "xml" ? (
          <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              El XML que te manda el proveedor junto con el PDF. Es el documento fiscal: de ahi
              salen exactos el proveedor, la fecha, el folio, cada renglon y las tasas de
              impuesto, sin que nadie los teclee.
            </p>
            <div className="space-y-1">
              <label htmlFor="file-xml" className="text-sm font-medium text-neutral-700">
                Archivo XML
              </label>
              <input
                id="file-xml"
                name="file"
                type="file"
                required
                accept=".xml,text/xml,application/xml"
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Solo facturas de tipo Ingreso. Una nota de credito o un complemento de pago no son
              una compra y se rechazan.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              Para la nota de papel del mercado, la que no trae XML. La IA lee la foto y arma el
              borrador; tu lo revisas renglon por renglon antes de guardar.
            </p>
            {!iaDisponible && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                La lectura con IA no esta configurada en el servidor todavia (falta la llave de
                Anthropic). Mientras tanto, el XML si funciona.
              </p>
            )}
            <div className="space-y-1">
              <label htmlFor="file-foto" className="text-sm font-medium text-neutral-700">
                Foto de la nota
              </label>
              <input
                id="file-foto"
                name="file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
              />
              <p className="text-xs text-neutral-500">
                De frente, con el papel completo y buena luz. Si sale borrosa, los numeros salen
                mal.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="ivaNota" className="text-sm font-medium text-neutral-700">
                IVA de esa nota
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ivaNota"
                  name="ivaNota"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue="16"
                  className="w-24 rounded-md border border-neutral-200 px-3 py-2 text-sm tabular-nums"
                />
                <span className="text-sm text-neutral-500">%</span>
              </div>
              <p className="text-xs text-neutral-500">
                Si la nota no desglosa IVA, se le quita este porcentaje a cada importe para dejar
                el costo sin impuesto. Para una nota de mercado sin IVA, pon 0.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={pending || (modo === "foto" && !iaDisponible)}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending
            ? modo === "foto"
              ? "Leyendo la foto..."
              : "Leyendo el XML..."
            : "Leer y revisar"}
        </button>
      </form>

      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
      )}

      <p className="text-xs text-neutral-500">
        ¿Prefieres teclearla?{" "}
        <Link href="/purchases/new" className="font-medium text-brand-600 hover:underline">
          Capturar la compra a mano
        </Link>
        .
      </p>
    </div>
  );
}
