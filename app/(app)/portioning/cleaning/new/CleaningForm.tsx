"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { createCleaning, type CleaningState } from "../actions";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";
import { UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";

export type CleaningProduct = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  baseUnitLabel: string;
  grossUnitCost: string;
  isProcessed: boolean;
};

const initialState: CleaningState = {};

export default function CleaningForm({ products }: { products: CleaningProduct[] }) {
  const [state, formAction, pending] = useActionState(createCleaning, initialState);
  const [sourceId, setSourceId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [outputQty, setOutputQty] = useState("");

  const source = products.find((p) => p.id === sourceId);
  const output = products.find((p) => p.id === outputId);

  // El destino debe medirse en el mismo tipo de unidad que el origen: no se limpia un kilo
  // para obtener litros.
  const destinos = useMemo(() => {
    if (!source) return products.filter((p) => p.isProcessed);
    const tipo = UNIT_META[source.baseUnit].type;
    return products.filter((p) => p.id !== source.id && UNIT_META[p.baseUnit].type === tipo);
  }, [products, source]);

  const resumen = useMemo(() => {
    if (!source || !output) return null;
    const entrada = new Decimal(initialQty || "0");
    const salida = new Decimal(outputQty || "0");
    if (entrada.lte(0) || salida.lte(0)) return null;

    // Se comparan en la unidad del origen.
    const factor = new Decimal(UNIT_META[output.baseUnit].toCanonical).dividedBy(
      UNIT_META[source.baseUnit].toCanonical,
    );
    const salidaEnOrigen = salida.times(factor);
    const costoTotal = entrada.times(new Decimal(source.grossUnitCost));

    return {
      excede: salidaEnOrigen.gt(entrada),
      merma: entrada.minus(salidaEnOrigen),
      rendimiento: salidaEnOrigen.dividedBy(entrada).times(100),
      costoTotal,
      costoDestino: costoTotal.dividedBy(salida),
    };
  }, [source, output, initialQty, outputQty]);

  return (
    <form action={formAction} onKeyDown={blockEnterSubmit} className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="date" className="text-sm font-medium text-neutral-700">
            Fecha
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div />

        <div className="space-y-1">
          <label htmlFor="sourceProductId" className="text-sm font-medium text-neutral-700">
            Entro este producto
          </label>
          <select
            id="sourceProductId"
            name="sourceProductId"
            required
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setOutputId("");
            }}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Elige el producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseUnitLabel})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 pt-1">
            <input
              name="initialQty"
              type="number"
              step="0.0001"
              min="0"
              required
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
              placeholder="1"
              className="w-28 rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-neutral-500">{source?.baseUnitLabel ?? ""}</span>
          </div>
          {source && (
            <p className="text-xs text-neutral-500">
              Costo de compra: {formatMoney(Number(source.grossUnitCost), 2)} por {source.baseUnitLabel}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="outputProductId" className="text-sm font-medium text-neutral-700">
            Y salio este
          </label>
          <select
            id="outputProductId"
            name="outputProductId"
            required
            value={outputId}
            onChange={(e) => setOutputId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">{sourceId ? "Elige el producto limpio" : "Primero elige el origen"}</option>
            {destinos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseUnitLabel})
                {p.isProcessed ? "" : " — se compra"}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 pt-1">
            <input
              name="outputQty"
              type="number"
              step="0.0001"
              min="0"
              required
              value={outputQty}
              onChange={(e) => setOutputQty(e.target.value)}
              placeholder="0.8"
              className="w-28 rounded-md border border-neutral-200 px-3 py-2 text-sm"
            />
            <span className="text-sm text-neutral-500">{output?.baseUnitLabel ?? ""}</span>
          </div>
          <p className="text-xs text-neutral-500">
            Si el producto limpio todavia no existe,{" "}
            <Link href="/products/new" className="font-medium text-brand-600 hover:underline">
              crealo en Productos
            </Link>{" "}
            marcando &quot;se obtiene por proceso&quot;.
          </p>
        </div>
      </div>

      {resumen && (
        <div
          className={
            resumen.excede
              ? "rounded-xl border border-red-200 bg-red-50 p-5"
              : "rounded-xl border border-brand-200 bg-brand-50 p-5"
          }
        >
          {resumen.excede ? (
            <p className="text-sm font-medium text-red-800">
              Obtuviste mas producto del que entro. Revisa las cantidades.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Merma</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                  {resumen.merma.toFixed(3)} {source?.baseUnitLabel}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
                  Rendimiento real
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                  {resumen.rendimiento.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Entro</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                  {formatMoney(resumen.costoTotal.toNumber())}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
                  Costo de {output?.name}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                  {formatMoney(resumen.costoDestino.toNumber(), 2)}
                  <span className="text-xs font-normal text-neutral-500"> por {output?.baseUnitLabel}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
          Comentario (opcional)
        </label>
        <input
          id="comment"
          name="comment"
          type="text"
          maxLength={200}
          placeholder="Ej. camaron con mucha cabeza, rindio menos de lo normal"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || resumen?.excede}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar limpieza"}
        </button>
        <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
