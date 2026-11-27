"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Decimal from "decimal.js";
import SearchableSelect from "@/app/(app)/_components/SearchableSelect";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import type { OpcionProducto } from "@/lib/compras/importar-tipos";
import { actualizarAsociacion, eliminarAsociacion } from "./actions";

export type FilaAsociacion = {
  id: string;
  descripcion: string;
  unidadDocumento: string;
  proveedor: string | null;
  productId: string;
  productoNombre: string;
  factor: string;
  presentationUnit: UnitValue;
  presentationLabel: string | null;
  vecesUsada: number;
  ultimoUso: string | null;
};

const cifras = (texto: string) => {
  try {
    return new Decimal(texto)
      .toDecimalPlaces(4)
      .toNumber()
      .toLocaleString("es-MX", { maximumFractionDigits: 4 });
  } catch {
    return texto;
  }
};

/** "1 KGM = 1 KG" o "1 Pieza = 1 Botella (700 ML)", en una linea. */
function equivalencia(fila: FilaAsociacion): string {
  const izquierda = `1 ${fila.unidadDocumento || "unidad"}`;
  if (fila.presentationLabel) {
    return `${izquierda} = 1 ${fila.presentationLabel} (${cifras(fila.factor)} ${UNIT_LABELS[fila.presentationUnit]})`;
  }
  return `${izquierda} = ${cifras(fila.factor)} ${UNIT_LABELS[fila.presentationUnit]}`;
}

export default function AsociacionesTable({
  filas,
  productos,
}: {
  filas: FilaAsociacion[];
  productos: OpcionProducto[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [estado, accionGuardar, guardando] = useActionState(actualizarAsociacion, undefined);
  const [borrando, startBorrado] = useTransition();
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const opcionesProducto = useMemo(
    () => productos.map((p) => ({ id: p.id, label: `${p.name} · ${UNIT_LABELS[p.baseUnit]}` })),
    [productos],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      [f.descripcion, f.productoNombre, f.proveedor ?? "", f.unidadDocumento]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [filas, busqueda]);

  function borrar(fila: FilaAsociacion) {
    const aviso = `Borrar la asociacion de "${fila.descripcion}" con ${fila.productoNombre}.\n\nLas compras ya guardadas no cambian. Lo que se pierde es el atajo: la proxima factura con ese texto habra que emparejarla a mano otra vez.`;
    if (!window.confirm(aviso)) return;
    setErrorBorrado(null);
    startBorrado(async () => {
      const resultado = await eliminarAsociacion(fila.id);
      if (resultado?.error) setErrorBorrado(resultado.error);
    });
  }

  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">
        Todavia no hay ninguna asociacion. Se crean solas cuando subes un XML o una foto y
        confirmas a que producto corresponde cada renglon.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por texto, producto o proveedor..."
          className="w-72 rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <p className="text-sm text-neutral-500">
          {visibles.length === filas.length
            ? `${filas.length} ${filas.length === 1 ? "asociacion" : "asociaciones"}`
            : `${visibles.length} de ${filas.length}`}
        </p>
      </div>

      {estado?.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{estado.error}</p>
      )}
      {errorBorrado && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorBorrado}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
            <tr>
              <th className="px-3 py-3">Dice el documento</th>
              <th className="px-3 py-3">Es este producto</th>
              <th className="px-3 py-3">Equivale a</th>
              <th className="px-3 py-3 w-24">Usos</th>
              <th className="px-3 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila) =>
              editando === fila.id ? (
                <tr key={fila.id} className="border-t border-neutral-100 bg-neutral-50/60">
                  <td colSpan={5} className="px-3 py-4">
                    <EditorAsociacion
                      fila={fila}
                      productos={productos}
                      productoPorId={productoPorId}
                      opcionesProducto={opcionesProducto}
                      accion={accionGuardar}
                      guardando={guardando}
                      onCancelar={() => setEditando(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={fila.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-neutral-900 wrap-anywhere">{fila.descripcion}</p>
                    <p className="text-xs text-neutral-500">
                      {fila.proveedor ?? "Cualquier proveedor"}
                      {fila.unidadDocumento ? ` · ${fila.unidadDocumento}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-900">{fila.productoNombre}</td>
                  <td className="px-3 py-2 align-top text-neutral-600 tabular-nums">
                    {equivalencia(fila)}
                  </td>
                  <td className="px-3 py-2 align-top text-neutral-600 tabular-nums">
                    {fila.vecesUsada}
                    {fila.ultimoUso && (
                      <span className="block text-xs text-neutral-400">{fila.ultimoUso}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(fila.id)}
                      className="text-sm font-medium text-brand-600 transition-colors hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(fila)}
                      disabled={borrando}
                      className="ml-3 text-sm font-medium text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditorAsociacion({
  fila,
  productoPorId,
  opcionesProducto,
  accion,
  guardando,
  onCancelar,
}: {
  fila: FilaAsociacion;
  productos: OpcionProducto[];
  productoPorId: Map<string, OpcionProducto>;
  opcionesProducto: { id: string; label: string }[];
  accion: (formData: FormData) => void;
  guardando: boolean;
  onCancelar: () => void;
}) {
  const [productId, setProductId] = useState(fila.productId);
  const [etiqueta, setEtiqueta] = useState(fila.presentationLabel ?? "");
  const [factor, setFactor] = useState(fila.factor);
  const [unidad, setUnidad] = useState<UnitValue>(fila.presentationUnit);

  const producto = productoPorId.get(productId);
  const bultos = producto?.bultos ?? [];
  const unidades = producto
    ? UNITS.filter((u) => UNIT_META[u].type === UNIT_META[producto.baseUnit].type)
    : UNITS;

  function cambiarProducto(id: string) {
    const nuevo = productoPorId.get(id);
    setProductId(id);
    // Lo configurado era del producto anterior: su bulto no existe aqui y su unidad puede medir
    // otra cosa. Se arranca limpio en la unidad base del producto nuevo.
    setEtiqueta("");
    if (nuevo) setUnidad(nuevo.baseUnit);
  }

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="id" value={fila.id} />
      <input type="hidden" name="presentationLabel" value={etiqueta} />

      <p className="text-sm text-neutral-600">
        Cuando un documento de{" "}
        <b className="text-neutral-900">{fila.proveedor ?? "cualquier proveedor"}</b> diga{" "}
        <b className="text-neutral-900">{fila.descripcion}</b>
        {fila.unidadDocumento ? (
          <>
            {" "}
            en <b className="text-neutral-900">{fila.unidadDocumento}</b>
          </>
        ) : null}
        :
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Es este producto
          </span>
          <SearchableSelect
            name="productId"
            options={opcionesProducto}
            value={productId}
            onChange={cambiarProducto}
            placeholder="Buscar producto..."
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Y una unidad del documento es
          </label>
          <select
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">una cantidad suelta</option>
            {bultos.map((b) => (
              <option key={b.id} value={b.label}>
                1 {b.label} ({cifras(b.quantity)} {UNIT_LABELS[b.unit]})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Cuanto es
          </label>
          {etiqueta ? (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              Lo que trae el {etiqueta}
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                name="factor"
                type="number"
                step="any"
                min="0"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm tabular-nums"
              />
              <select
                name="presentationUnit"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value as UnitValue)}
                className="rounded-md border border-neutral-200 px-2 py-2 text-sm"
              >
                {unidades.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
