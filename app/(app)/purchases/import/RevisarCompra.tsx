"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import SearchableSelect from "@/app/(app)/_components/SearchableSelect";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { sumTaxes } from "@/lib/taxes";
import { asociacionDeRenglon, convertirCaptura, esBulto } from "@/lib/compras/captura";
import { TOLERANCIA_CUADRE } from "@/lib/compras/cuadre";
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
  /** El importe tal como venia en el papel, para poder recalcular si cambia la respuesta del IVA. */
  importeDocumento: string;
  importe: string;
  ivaRate: string;
  iepsRate: string;
  coincidencia: CompraResuelta["lineas"][number]["coincidencia"];
};

/** Lo que se puede contestar cuando la nota no desglosa IVA. */
const RESPUESTAS_IVA = [
  { valor: "0", etiqueta: "No causa IVA: los precios son el costo" },
  { valor: "16", etiqueta: "Si lo traen, al 16%" },
  { valor: "8", etiqueta: "Si lo traen, al 8% (frontera)" },
];

function numero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cifras = (d: Decimal) =>
  d.toDecimalPlaces(4).toNumber().toLocaleString("es-MX", { maximumFractionDigits: 4 });

/** Le quita a un importe el impuesto que ya trae adentro. Dividir, no restar el porcentaje. */
function sinImpuesto(importe: string, tasa: string): string {
  const bruto = new Decimal(numero(importe));
  const porciento = new Decimal(numero(tasa));
  if (porciento.lte(0)) return bruto.toDecimalPlaces(2).toString();
  return bruto.dividedBy(new Decimal(1).plus(porciento.dividedBy(100))).toDecimalPlaces(2).toString();
}

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

  const productoPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const [fecha, setFecha] = useState(compra.fecha ?? "");
  const [supplierId, setSupplierId] = useState(compra.proveedor.supplierId ?? "");
  const [folio, setFolio] = useState(compra.folio ?? "");
  const [recordar, setRecordar] = useState(true);
  // El total del papel. Es el numero contra el que tiene que cuadrar todo lo demas.
  const [totalNota, setTotalNota] = useState(compra.total ?? "");
  // Solo cuando el documento no desglosa IVA: que contesto la persona. Vacio = sin contestar,
  // y sin contestar no se guarda, porque la diferencia entre 0% y 16% es el costo del insumo.
  const [respuestaIva, setRespuestaIva] = useState("");

  const [filas, setFilas] = useState<Fila[]>(() =>
    compra.lineas.map((l) => {
      const producto = l.productId ? productoPorId.get(l.productId) : undefined;
      return {
        id: l.id,
        descripcion: l.descripcion,
        cantidadDocumento: l.cantidad,
        unidadDocumento: l.unidadDocumento,
        productId: l.productId ?? "",
        cantidad: l.cantidadCaptura,
        unidad: l.unidadCaptura,
        importeDocumento: l.importe,
        importe: l.importe,
        // La del documento manda sobre la del catalogo: la factura es la factura. Cuando el
        // documento no trae tasas (una nota de papel), se arranca con la del producto.
        ivaRate: l.ivaRate ?? producto?.ivaRate ?? "0",
        iepsRate: l.iepsRate ?? producto?.iepsRate ?? "0",
        coincidencia: l.coincidencia,
      };
    }),
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

  /**
   * La respuesta a "esta nota trae el IVA adentro". Recalcula todos los importes desde lo que
   * decia el papel, no desde lo que quedo en pantalla: si no, contestar dos veces seguidas
   * dividiria dos veces.
   */
  function contestarIva(tasa: string) {
    setRespuestaIva(tasa);
    setFilas((prev) =>
      prev.map((f) => ({
        ...f,
        importe: sinImpuesto(f.importeDocumento, tasa),
        ivaRate: tasa,
      })),
    );
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
        // Las tasas del catalogo solo se heredan cuando el documento no traia las suyas.
        const tasas = compra.desglosaIva
          ? {}
          : { ivaRate: respuestaIva || producto?.ivaRate || f.ivaRate, iepsRate: producto?.iepsRate ?? f.iepsRate };
        return { ...f, productId, unidad: nueva, ...tasas };
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
  const pendientes = problemas.filter(Boolean).length;

  // Los impuestos se suman con la misma funcion que usa el resto de la app (IEPS primero a la
  // base, IVA encima), para que lo que dice esta pantalla sea exactamente lo que va a quedar
  // guardado y no una cuenta parecida hecha aparte.
  const calculado = sumTaxes(
    filas.map((f) => ({
      subtotal: numero(f.importe),
      rates: { ivaRate: numero(f.ivaRate), iepsRate: numero(f.iepsRate) },
    })),
  );

  // Lo retenido en el documento ya viene descontado del total del papel, asi que se le resta
  // a la captura antes de comparar. Si no, una factura de fletes nunca cuadraria.
  const retenciones = numero(compra.retenciones ?? "0");
  const totalDelPapel = numero(totalNota);
  const diferencia = calculado.total - retenciones - totalDelPapel;
  const cuadra = totalDelPapel > 0 && Math.abs(diferencia) <= TOLERANCIA_CUADRE;
  const faltaContestarIva = !compra.desglosaIva && respuestaIva === "";

  const rows = filas.flatMap((f) => {
    const convertido = convertirCaptura(f.cantidad, f.unidad, productoPorId.get(f.productId));
    if (!convertido) return [];
    return [
      {
        productId: f.productId,
        presentationLabel: convertido.presentationLabel,
        presentationQty: convertido.presentationQty,
        presentationUnit: convertido.presentationUnit,
        totalPrice: f.importe,
        ivaRate: f.ivaRate,
        iepsRate: f.iepsRate,
      },
    ];
  });

  // La asociacion guarda como se traduce ESTE texto de ESTE proveedor, para no volver a
  // emparejarlo a mano la proxima vez. El factor es por una unidad del documento: asi sigue
  // sirviendo cuando la siguiente factura traiga otra cantidad.
  const asociaciones = recordar
    ? filas.flatMap((f) => {
        const convertido = convertirCaptura(f.cantidad, f.unidad, productoPorId.get(f.productId));
        if (!convertido) return [];
        const asociacion = asociacionDeRenglon(f, convertido);
        return asociacion ? [asociacion] : [];
      })
    : [];

  const puedeGuardar =
    Boolean(fecha) && filas.length > 0 && pendientes === 0 && !faltaContestarIva && cuadra && !pending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-neutral-600">
          <span className="font-medium text-neutral-900">
            {compra.origen === "xml" ? "Factura leida del XML" : "Nota leida de la foto"}
          </span>
          {compra.proveedor.nombre && <> · {compra.proveedor.nombre}</>}
          {compra.proveedor.rfc && <> · {compra.proveedor.rfc}</>}
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

      {!compra.desglosaIva && (
        <div
          className={`rounded-xl border p-4 ${
            faltaContestarIva ? "border-brand-300 bg-brand-50" : "border-neutral-200 bg-white shadow-sm"
          }`}
        >
          <p className="text-sm font-semibold text-neutral-900">
            Esta nota no desglosa el IVA. ¿Los precios ya lo traen?
          </p>
          <p className="mt-0.5 text-sm text-neutral-600">
            No lo puedo saber de la foto, y la diferencia no es menor: si los precios ya traen
            IVA y se guardan tal cual, el costo de tus platillos sale 16% mas alto de lo que es.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {RESPUESTAS_IVA.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => contestarIva(opcion.valor)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  respuestaIva === opcion.valor
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
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
        <input type="hidden" name="documentoTotal" value={totalNota} />
        <input type="hidden" name="documentoRetenciones" value={compra.retenciones ?? ""} />
        <input ref={inputDocumento} type="file" name="documento" className="hidden" tabIndex={-1} />

        <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-4">
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
          <div className="space-y-1">
            <label htmlFor="totalNota" className="text-sm font-medium text-neutral-700">
              Total que dice el papel
            </label>
            <input
              id="totalNota"
              type="number"
              step="0.01"
              min="0"
              value={totalNota}
              onChange={(e) => setTotalNota(e.target.value)}
              readOnly={compra.origen === "xml" && Boolean(compra.total)}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm tabular-nums read-only:bg-neutral-50 read-only:text-neutral-500"
            />
            <p className="text-xs text-neutral-500">
              {compra.origen === "xml" && compra.total
                ? "Lo dice el XML: no se puede cambiar."
                : "Con impuestos, lo que se le paga al proveedor."}
            </p>
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
                <th className="px-3 py-3 w-28">IVA / IEPS %</th>
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
                      <div className="flex gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={fila.ivaRate}
                          onChange={(e) => actualizar(fila.id, { ivaRate: e.target.value })}
                          title="IVA %"
                          className="w-full rounded-md border border-neutral-200 px-1.5 py-1.5 text-sm tabular-nums"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={fila.iepsRate}
                          onChange={(e) => actualizar(fila.id, { iepsRate: e.target.value })}
                          title="IEPS %"
                          className="w-full rounded-md border border-neutral-200 px-1.5 py-1.5 text-sm tabular-nums text-neutral-500"
                        />
                      </div>
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
          </table>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            cuadra ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <div className="grid gap-1 text-sm sm:grid-cols-2">
            <span className="text-neutral-600">Suma de los renglones (subtotal)</span>
            <span className="tabular-nums text-neutral-900 sm:text-right">{pesos(calculado.subtotal)}</span>
            {calculado.ieps > 0 && (
              <>
                <span className="text-neutral-600">IEPS</span>
                <span className="tabular-nums text-neutral-900 sm:text-right">{pesos(calculado.ieps)}</span>
              </>
            )}
            <span className="text-neutral-600">IVA</span>
            <span className="tabular-nums text-neutral-900 sm:text-right">{pesos(calculado.iva)}</span>
            {retenciones > 0 && (
              <>
                <span className="text-neutral-600">Impuestos retenidos</span>
                <span className="tabular-nums text-neutral-900 sm:text-right">
                  −{pesos(retenciones)}
                </span>
              </>
            )}
            <span className="font-semibold text-neutral-900">Total de esta captura</span>
            <span className="font-semibold tabular-nums text-neutral-900 sm:text-right">
              {pesos(calculado.total - retenciones)}
            </span>
            <span className="text-neutral-600">Total que dice el papel</span>
            <span className="tabular-nums text-neutral-900 sm:text-right">{pesos(totalDelPapel)}</span>
          </div>
          <p className={`mt-2 text-sm font-medium ${cuadra ? "text-emerald-800" : "text-amber-900"}`}>
            {totalDelPapel <= 0
              ? "Captura el total que dice el papel: es contra ese numero que se cuadra."
              : cuadra
                ? "Cuadra con el papel."
                : `Diferencia de ${pesos(Math.abs(diferencia))}: la captura da ${
                    diferencia > 0 ? "de mas" : "de menos"
                  }. No se puede guardar asi.`}
          </p>
        </div>

        {pendientes > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {pendientes === 1
              ? "Hay 1 renglon sin resolver."
              : `Hay ${pendientes} renglones sin resolver.`}{" "}
            Completalos para poder guardar. Quitar uno con la × tampoco sirve: el total dejaria
            de cuadrar con el papel.
          </p>
        )}

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
              : `Guardar ${filas.length} ${filas.length === 1 ? "renglon" : "renglones"} · ${pesos(calculado.total - retenciones)}`}
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
