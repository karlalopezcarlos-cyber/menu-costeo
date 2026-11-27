"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import SearchableSelect from "@/app/(app)/_components/SearchableSelect";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { asociacionDeRenglon, convertirCaptura, esBulto } from "@/lib/compras/captura";
import type {
  CompraResuelta,
  OpcionProducto,
  OpcionProveedor,
  UnidadCaptura,
} from "@/lib/compras/importar-tipos";
import { createPurchase } from "../actions";

type Fila = {
  id: string;
  descripcion: string;
  cantidadDocumento: string;
  unidadDocumento: string;
  productId: string;
  /** Lo que se teclea. Son bultos o unidades segun `unidad`. */
  cantidad: string;
  unidad: UnidadCaptura;
  importe: string;
  ivaRate: string | null;
  iepsRate: string | null;
  coincidencia: CompraResuelta["lineas"][number]["coincidencia"];
};

function numero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cifras = (d: Decimal) =>
  d.toDecimalPlaces(4).toNumber().toLocaleString("es-MX", { maximumFractionDigits: 4 });

export default function RevisarCompra({
  compra,
  productos,
  proveedores,
  archivo,
  onDescartar,
}: {
  compra: CompraResuelta;
  productos: OpcionProducto[];
  proveedores: OpcionProveedor[];
  /** El documento que se subio, para guardarlo junto con la compra. */
  archivo: File | null;
  onDescartar: () => void;
}) {
  const [state, formAction, pending] = useActionState(createPurchase, undefined);

  const [fecha, setFecha] = useState(compra.fecha ?? "");
  const [supplierId, setSupplierId] = useState(compra.proveedor.supplierId ?? "");
  const [folio, setFolio] = useState(compra.folio ?? "");
  const [recordar, setRecordar] = useState(true);
  const [filas, setFilas] = useState<Fila[]>(() =>
    compra.lineas.map((l) => ({
      id: l.id,
      descripcion: l.descripcion,
      cantidadDocumento: l.cantidad,
      unidadDocumento: l.unidadDocumento,
      productId: l.productId ?? "",
      cantidad: l.cantidadCaptura,
      unidad: l.unidadCaptura,
      importe: l.importe,
      ivaRate: l.ivaRate,
      iepsRate: l.iepsRate,
      coincidencia: l.coincidencia,
    })),
  );

  // El archivo viaja otra vez al servidor dentro del mismo envio que guarda la compra, para
  // que se archive con el folio que le toque. Un input de archivo no se puede llenar desde
  // React, pero si se le puede asignar un FileList armado a mano.
  const inputDocumento = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = inputDocumento.current;
    if (!input || !archivo) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(archivo);
      input.files = dt.files;
    } catch {
      // Sin esto la compra se guarda igual, nomas sin el respaldo del documento.
    }
  }, [archivo]);

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const opcionesProducto = useMemo(
    () => productos.map((p) => ({ id: p.id, label: `${p.name} · ${UNIT_LABELS[p.baseUnit]}` })),
    [productos],
  );
  const opcionesProveedor = useMemo(
    () => [{ id: "", label: "Sin proveedor" }, ...proveedores.map((p) => ({ id: p.id, label: p.name }))],
    [proveedores],
  );

  function actualizar(id: string, cambios: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function cambiarProducto(id: string, productId: string) {
    const producto = productoPorId.get(productId);
    setFilas((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        // La unidad que traia era para el producto anterior: un bulto de aquel no existe en
        // este, y una unidad de peso no sirve si este se mide en litros. Se arranca de nuevo
        // con el primer bulto del producto nuevo, o con su unidad base.
        const compatible =
          producto && f.unidad && !esBulto(f.unidad)
            ? UNIT_META[f.unidad as UnitValue].type === UNIT_META[producto.baseUnit].type
            : false;
        const nueva: UnidadCaptura = compatible
          ? f.unidad
          : producto
            ? producto.bultos.length > 0
              ? `PRES:${producto.bultos[0].id}`
              : producto.baseUnit
            : "";
        return { ...f, productId, unidad: nueva };
      }),
    );
  }

  /** Lo que le falta a una fila para poder guardarse, en espanol. */
  function problemaDe(fila: Fila): string | null {
    if (!fila.productId) return "Elige el producto";
    const producto = productoPorId.get(fila.productId);
    if (!producto) return "Elige el producto";
    if (numero(fila.cantidad) <= 0) return "Falta la cantidad";
    if (!fila.unidad) return "Falta la unidad";
    const convertido = convertirCaptura(fila.cantidad, fila.unidad, producto);
    if (!convertido) return "Elige la unidad otra vez";
    if (UNIT_META[convertido.presentationUnit].type !== UNIT_META[producto.baseUnit].type) {
      return `No se puede pasar de ${UNIT_LABELS[convertido.presentationUnit]} a ${UNIT_LABELS[producto.baseUnit]}`;
    }
    if (numero(fila.importe) <= 0) return "Falta el importe";
    return null;
  }

  const problemas = filas.map(problemaDe);
  const listas = filas.filter((_, i) => problemas[i] === null);
  const sumaListas = listas.reduce((acc, f) => acc + numero(f.importe), 0);
  const sumaTodas = filas.reduce((acc, f) => acc + numero(f.importe), 0);
  const pendientes = problemas.filter(Boolean).length;

  const subtotalDoc = compra.subtotal ? numero(compra.subtotal) : null;
  const descuadre = subtotalDoc !== null && Math.abs(sumaTodas - subtotalDoc) > 0.05;

  const rows = listas.flatMap((f) => {
    const convertido = convertirCaptura(f.cantidad, f.unidad, productoPorId.get(f.productId));
    if (!convertido) return [];
    return [
      {
        productId: f.productId,
        presentationLabel: convertido.presentationLabel,
        presentationQty: convertido.presentationQty,
        presentationUnit: convertido.presentationUnit,
        totalPrice: f.importe,
        ...(f.ivaRate !== null ? { ivaRate: f.ivaRate } : {}),
        ...(f.iepsRate !== null ? { iepsRate: f.iepsRate } : {}),
      },
    ];
  });

  // La asociacion guarda como se traduce ESTE texto de ESTE proveedor, para no volver a
  // emparejarlo a mano la proxima vez. El factor es por una unidad del documento: asi sigue
  // sirviendo cuando la siguiente factura traiga otra cantidad.
  const asociaciones = recordar
    ? listas.flatMap((f) => {
        const convertido = convertirCaptura(f.cantidad, f.unidad, productoPorId.get(f.productId));
        if (!convertido) return [];
        const asociacion = asociacionDeRenglon(f, convertido);
        return asociacion ? [asociacion] : [];
      })
    : [];

  const puedeGuardar = Boolean(fecha) && rows.length > 0 && !pending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-neutral-600">
          <span className="font-medium text-neutral-900">
            {compra.origen === "xml" ? "Factura leida del XML" : "Nota leida de la foto"}
          </span>
          {compra.proveedor.nombre && <> · {compra.proveedor.nombre}</>}
          {compra.proveedor.rfc && <> · {compra.proveedor.rfc}</>}
          {compra.total && <> · total del documento {pesos(numero(compra.total))}</>}
        </div>
        <button
          type="button"
          onClick={onDescartar}
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Subir otro documento
        </button>
      </div>

      {compra.origen === "foto" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Esto lo leyo la IA de una foto y <b>se puede equivocar</b>. Revisa cantidad e importe
          renglon por renglon contra el papel antes de guardar: de aqui sale el costo de tus
          platillos.
        </p>
      )}

      {compra.avisos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Revisa esto</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {compra.avisos.map((aviso, i) => (
              <li key={i}>{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      {compra.proveedor.sinCatalogo && (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          El documento viene de <b>{compra.proveedor.nombre}</b> y no hay un proveedor con ese
          nombre ni ese RFC en tu catalogo. Puedes guardar la compra sin proveedor y asignarselo
          despues, o darlo de alta primero en{" "}
          <Link href="/settings/suppliers" className="font-medium text-brand-600 hover:underline">
            Configuracion &gt; Proveedores
          </Link>
          .
        </p>
      )}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />
        <input type="hidden" name="asociaciones" value={JSON.stringify(asociaciones)} />
        <input type="hidden" name="documentoTipo" value={compra.origen === "xml" ? "XML" : "FOTO"} />
        <input ref={inputDocumento} type="file" name="documento" className="hidden" tabIndex={-1} />

        <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-3">
          <div className="space-y-1">
            <label htmlFor="purchaseDate" className="text-sm font-medium text-neutral-700">
              Fecha de compra
            </label>
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium text-neutral-700">Proveedor</span>
            <SearchableSelect
              name="supplierId"
              options={opcionesProveedor}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="Buscar proveedor..."
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="invoiceFolio" className="text-sm font-medium text-neutral-700">
              Folio del documento
            </label>
            <input
              id="invoiceFolio"
              name="invoiceFolio"
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              <tr>
                <th className="px-3 py-3">Dice el documento</th>
                <th className="px-3 py-3">Producto</th>
                <th className="px-3 py-3 w-28">Cantidad</th>
                <th className="px-3 py-3 w-40">Unidad</th>
                <th className="px-3 py-3 w-32">Importe sin IVA</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const problema = problemas[i];
                const producto = productoPorId.get(fila.productId);
                const unidades = producto
                  ? UNITS.filter((u) => UNIT_META[u].type === UNIT_META[producto.baseUnit].type)
                  : UNITS;
                const convertido = convertirCaptura(fila.cantidad, fila.unidad, producto);
                return (
                  <tr key={fila.id} className={`border-t border-neutral-100 ${problema ? "bg-amber-50/60" : ""}`}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-neutral-900 wrap-anywhere">{fila.descripcion}</p>
                      <p className="text-xs text-neutral-500">
                        {fila.cantidadDocumento || "?"} {fila.unidadDocumento}
                        {fila.coincidencia === "guardada" && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                            ya asociado
                          </span>
                        )}
                        {fila.coincidencia === "parecida" && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            parecido, confirma
                          </span>
                        )}
                      </p>
                      {problema && <p className="mt-1 text-xs font-medium text-amber-800">{problema}</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <SearchableSelect
                        name={`producto-${fila.id}`}
                        options={opcionesProducto}
                        value={fila.productId}
                        onChange={(id) => cambiarProducto(fila.id, id)}
                        placeholder="Buscar producto..."
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={fila.cantidad}
                        onChange={(e) => actualizar(fila.id, { cantidad: e.target.value })}
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm tabular-nums"
                      />
                      {convertido && convertido.bulto && (
                        <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                          = {cifras(new Decimal(convertido.presentationQty))}{" "}
                          {UNIT_LABELS[convertido.presentationUnit]}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        value={fila.unidad}
                        onChange={(e) => actualizar(fila.id, { unidad: e.target.value as UnidadCaptura })}
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                      >
                        <option value="">-</option>
                        {producto?.bultos.map((b) => (
                          <option key={b.id} value={`PRES:${b.id}`}>
                            {b.label} ({cifras(new Decimal(b.quantity))} {UNIT_LABELS[b.unit]})
                          </option>
                        ))}
                        {unidades.map((u) => (
                          <option key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={fila.importe}
                        onChange={(e) => actualizar(fila.id, { importe: e.target.value })}
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => setFilas((prev) => prev.filter((f) => f.id !== fila.id))}
                        className="text-neutral-400 transition-colors hover:text-red-600"
                        title="Quitar este renglon"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-neutral-200 bg-neutral-50 text-sm">
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right font-medium text-neutral-600">
                  Suma de lo que se va a guardar
                </td>
                <td className="px-3 py-3 font-semibold tabular-nums text-neutral-900">{pesos(sumaListas)}</td>
                <td></td>
              </tr>
              {subtotalDoc !== null && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-neutral-500">
                    Subtotal del documento
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${descuadre ? "font-semibold text-amber-700" : "text-neutral-500"}`}
                  >
                    {pesos(subtotalDoc)}
                  </td>
                  <td></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <input
            type="checkbox"
            checked={recordar}
            onChange={(e) => setRecordar(e.target.checked)}
            className="mt-0.5 size-4 rounded border-neutral-300"
          />
          <span className="text-sm text-neutral-600">
            <span className="font-medium text-neutral-900">Recordar estas asociaciones</span>
            <br />
            La proxima vez que llegue un documento con los mismos renglones, el producto y la
            unidad se llenan solos. Se pueden revisar y borrar en{" "}
            <Link
              href="/purchases/asociaciones"
              className="font-medium text-brand-600 hover:underline"
              target="_blank"
            >
              Compras &gt; Asociaciones
            </Link>
            .
          </span>
        </label>

        {pendientes > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {pendientes === 1
              ? "Hay 1 renglon sin resolver y no se va a guardar."
              : `Hay ${pendientes} renglones sin resolver y no se van a guardar.`}{" "}
            Completalos, o quitalos con la × si no los quieres cargar.
          </p>
        )}

        {state?.error && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!puedeGuardar}
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending
              ? "Guardando..."
              : `Guardar ${rows.length} ${rows.length === 1 ? "renglon" : "renglones"} · ${pesos(sumaListas)}`}
          </button>
          <Link
            href="/purchases"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
