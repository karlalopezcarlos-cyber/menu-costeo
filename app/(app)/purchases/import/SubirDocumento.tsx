"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { leerDocumento, type LeerState } from "./actions";
import RevisarCompra from "./RevisarCompra";
import type { OpcionProducto, OpcionProveedor } from "@/lib/compras/importar-tipos";

const initialState: LeerState = {};

type Modo = "xml" | "foto";

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp"];

function pesoLegible(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  const inputFoto = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<{ url: string; nombre: string; bytes: number } | null>(null);
  // El archivo se guarda tambien aqui porque la pantalla de revision lo vuelve a mandar para
  // archivarlo con la compra, y para entonces este formulario ya no esta en pantalla.
  const [archivo, setArchivo] = useState<File | null>(null);
  const [avisoPegado, setAvisoPegado] = useState<string | null>(null);
  const [sePuedePegar, setSePuedePegar] = useState(true);

  /** Deja la imagen dentro del input de archivo para que viaje en el envio normal del formulario. */
  function ponerEnElInput(archivo: File): boolean {
    const input = inputFoto.current;
    if (!input) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(archivo);
      input.files = dt.files;
      return input.files.length === 1;
    } catch {
      return false;
    }
  }

  function mostrar(elegido: File | null) {
    setArchivo(elegido);
    setFoto((previa) => {
      if (previa) URL.revokeObjectURL(previa.url);
      return elegido
        ? { url: URL.createObjectURL(elegido), nombre: elegido.name || "captura", bytes: elegido.size }
        : null;
    });
  }

  // Pegar funciona en toda la pantalla, no solo dentro de un recuadro: quien acaba de tomar
  // una captura aprieta Cmd+V donde sea y espera que caiga.
  useEffect(() => {
    if (modo !== "foto") return;

    function alPegar(evento: ClipboardEvent) {
      const archivos = Array.from(evento.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((archivo): archivo is File => archivo !== null);

      const imagen = archivos.find((archivo) => TIPOS_IMAGEN.includes(archivo.type));
      if (!imagen) {
        // Pegar texto en un campo no es un error, es lo normal: solo se avisa cuando lo que
        // se pego era un archivo y no servia.
        if (archivos.length > 0) {
          setAvisoPegado("Lo que pegaste no es una imagen JPG, PNG o WEBP.");
        }
        return;
      }

      evento.preventDefault();
      if (ponerEnElInput(imagen)) {
        mostrar(imagen);
        setAvisoPegado(null);
      } else {
        setSePuedePegar(false);
        setAvisoPegado("Tu navegador no deja pegar la imagen aqui. Usa el boton de archivo.");
      }
    }

    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [modo]);

  // La vista previa es un objeto en memoria del navegador: hay que soltarlo al salir.
  useEffect(() => {
    return () => {
      if (foto) URL.revokeObjectURL(foto.url);
    };
    // Solo al desmontar: mostrar() ya libera la anterior en cada cambio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    mostrar(null);
    setAvisoPegado(null);
  }

  function elegirXml(elegido: File | null) {
    setArchivo(elegido);
  }

  if (state.compra) {
    return (
      <RevisarCompra
        compra={state.compra}
        productos={productos}
        proveedores={proveedores}
        archivo={archivo}
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
          onClick={() => cambiarModo("xml")}
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
          onClick={() => cambiarModo("foto")}
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
                onChange={(e) => elegirXml(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Solo facturas de tipo Ingreso. Una nota de credito o un complemento de pago no son
              una compra y se rechazan.
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-600">
              Para la nota de papel del mercado, la que no trae XML. La IA lee la imagen y arma el
              borrador; tu lo revisas renglon por renglon antes de guardar.
            </p>
            {!iaDisponible && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                La lectura con IA no esta configurada en el servidor todavia (falta la llave de
                Anthropic). Mientras tanto, el XML si funciona.
              </p>
            )}

            <div
              className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
                foto ? "border-emerald-300 bg-emerald-50/50" : "border-neutral-200 bg-neutral-50"
              }`}
            >
              {foto ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto.url}
                    alt="Vista previa de la nota"
                    className="mx-auto max-h-64 rounded-md border border-neutral-200 bg-white object-contain"
                  />
                  <p className="text-sm text-neutral-600">
                    {foto.nombre} · {pesoLegible(foto.bytes)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      mostrar(null);
                      if (inputFoto.current) inputFoto.current.value = "";
                    }}
                    className="text-sm font-medium text-neutral-500 transition-colors hover:text-red-600"
                  >
                    Quitar la imagen
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-neutral-700">
                    {sePuedePegar ? "Pega aqui la imagen con ⌘V" : "Elige la imagen con el boton de abajo"}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {sePuedePegar
                      ? "Sirve una captura de pantalla o una foto copiada: no hace falta guardarla en el disco."
                      : "Tu navegador no permite pegar imagenes en esta pantalla."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label htmlFor="file-foto" className="text-sm font-medium text-neutral-700">
                O elige el archivo
              </label>
              <input
                ref={inputFoto}
                id="file-foto"
                name="file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => {
                  mostrar(e.target.files?.[0] ?? null);
                  setAvisoPegado(null);
                }}
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-200 file:bg-neutral-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-700"
              />
              <p className="text-xs text-neutral-500">
                De frente, con el papel completo y buena luz. Si sale borrosa, los numeros salen
                mal.
              </p>
            </div>

            {avisoPegado && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {avisoPegado}
              </p>
            )}

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
              ? "Leyendo la imagen..."
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
