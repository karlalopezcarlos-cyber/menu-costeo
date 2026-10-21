"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { formatMoney } from "@/lib/format";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";
import {
  computeTransformation,
  resolveRefQtyPerUnit,
  TransformationError,
  type TransformationProduct,
  type TransformationResult,
} from "@/lib/transformations";
import { createTransformation } from "../actions";

const initialState: { error?: string } = {};

type OutputRow = {
  key: string;
  productId: string;
  qty: string;
  /** Lo que el usuario teclea como peso por unidad; vacio = el de la ficha. */
  ref: string;
};

function nuevaFila(): OutputRow {
  return { key: Math.random().toString(36).slice(2), productId: "", qty: "", ref: "" };
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export type TransformationTemplateOption = {
  id: string;
  name: string;
  sourceProductId: string;
  outputs: { productId: string; refQtyPerUnit: string }[];
};

export default function TransformationForm({
  products,
  templates,
}: {
  products: TransformationProduct[];
  templates: TransformationTemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(createTransformation, initialState);
  const [sourceId, setSourceId] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [rows, setRows] = useState<OutputRow[]>([nuevaFila()]);
  const [templateId, setTemplateId] = useState("");

  /**
   * Aplicar una plantilla rellena el que entra y los que salen, y deja las cantidades vacias a
   * proposito: eso es lo que cambia cada dia y es justo lo que hay que mirar al capturar.
   */
  function aplicarPlantilla(id: string) {
    setTemplateId(id);
    const plantilla = templates.find((t) => t.id === id);
    if (!plantilla) return;
    setSourceId(plantilla.sourceProductId);
    setRows(
      plantilla.outputs.length
        ? plantilla.outputs.map((o) => ({
            key: Math.random().toString(36).slice(2),
            productId: o.productId,
            qty: "",
            ref: o.refQtyPerUnit,
          }))
        : [nuevaFila()],
    );
  }

  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const source = sourceId ? porId.get(sourceId) : undefined;

  // Lo que normalmente sale de este producto va arriba y separado: es lo que se va a capturar el
  // 90% de las veces. Lo demas sigue disponible, porque el dia que se porciona otra cosa no hay
  // que pelear con la pantalla.
  const { sugeridos, resto } = useMemo(() => {
    const candidatos = products.filter((p) => p.id !== sourceId);
    if (!sourceId) return { sugeridos: [], resto: candidatos };
    return {
      sugeridos: candidatos.filter((p) => p.defaultSourceProductId === sourceId),
      resto: candidatos.filter((p) => p.defaultSourceProductId !== sourceId),
    };
  }, [products, sourceId]);

  /** Peso por unidad que se va a usar: el tecleado manda sobre el de la ficha. */
  function refDe(row: OutputRow): Decimal | null {
    const output = porId.get(row.productId);
    if (!source || !output) return null;
    if (row.ref) {
      try {
        const tecleado = new Decimal(row.ref);
        if (tecleado.gt(0)) return tecleado;
      } catch {
        return null;
      }
    }
    return resolveRefQtyPerUnit(source.baseUnit, output);
  }

  function refSugerida(row: OutputRow): string {
    const output = porId.get(row.productId);
    if (!source || !output) return "";
    const ref = resolveRefQtyPerUnit(source.baseUnit, output);
    return ref ? ref.toDecimalPlaces(6).toString() : "";
  }

  const calculo = useMemo((): { result?: TransformationResult; error?: string } => {
    if (!source) return {};
    let qty: Decimal;
    try {
      qty = new Decimal(initialQty || "0");
    } catch {
      return {};
    }
    if (qty.lte(0)) return {};

    const capturadas = rows.filter((r) => r.productId && r.qty);
    const outputs = [];
    for (const row of capturadas) {
      const output = porId.get(row.productId);
      if (!output) continue;
      // Con una sola salida el gramaje no cambia nada: todo lo que entro se va ahi.
      const ref = refDe(row) ?? (capturadas.length === 1 ? new Decimal(1) : null);
      if (!ref) {
        return {
          error: `Como salieron varias cosas de esta tanda, dime cuantos ${source.baseUnitLabel} lleva cada ${output.name} para poder repartir el costo.`,
        };
      }
      outputs.push({
        productId: output.id,
        productName: output.name,
        qty: row.qty,
        refQtyPerUnit: ref,
        extraCostPerUnit: output.extraCostPerUnit,
      });
    }
    if (outputs.length === 0) return {};

    try {
      return { result: computeTransformation(qty, source.grossUnitCost, outputs) };
    } catch (error) {
      return { error: error instanceof TransformationError ? error.message : undefined };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, initialQty, rows, porId]);

  const resultado = calculo.result;

  return (
    <form action={formAction} onKeyDown={blockEnterSubmit} className="space-y-4">
      {templates.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="space-y-1">
            <label htmlFor="plantilla" className="text-sm font-medium text-neutral-700">
              Plantilla
            </label>
            <select
              id="plantilla"
              value={templateId}
              onChange={(e) => aplicarPlantilla(e.target.value)}
              className="w-full min-w-72 rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <option value="">Sin plantilla, lo armo a mano</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <p className="pb-2 text-xs text-neutral-500">
            Llena que entra y que sale. Las cantidades las capturas tu.
          </p>
          <Link href="/portioning/templates" className="ml-auto pb-2 text-xs text-neutral-500 hover:underline">
            Administrar plantillas
          </Link>
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm md:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="date" className="text-sm font-medium text-neutral-700">
            Fecha
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={hoy()}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="sourceProductId" className="text-sm font-medium text-neutral-700">
            Que entro
          </label>
          <select
            id="sourceProductId"
            name="sourceProductId"
            required
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setTemplateId("");
            }}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Elige el producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isProcessed ? " (de proceso)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="initialQty" className="text-sm font-medium text-neutral-700">
            Cuanto entro {source && <span className="text-neutral-400">({source.baseUnitLabel})</span>}
          </label>
          <input
            id="initialQty"
            name="initialQty"
            type="number"
            step="any"
            min="0"
            required
            value={initialQty}
            onChange={(e) => setInitialQty(e.target.value)}
            placeholder="1"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          {source && (
            <p className="text-xs text-neutral-500">
              A {formatMoney(Number(source.grossUnitCost), 2)} por {source.baseUnitLabel}
              {Number(source.yieldPercentage) < 100 && " (precio de compra, sin su rendimiento)"}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-700">Que salio</p>
            <p className="text-xs text-neutral-500">
              Captura lo que de verdad salio, aunque no cuadre con la cuenta: el costo se reparte
              entre esas piezas.
            </p>
          </div>
          <div className="flex items-center gap-3">
          <Link href="/portioning/portions/new" className="text-xs text-neutral-500 hover:underline">
            ¿Falta el producto que sale?
          </Link>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, nuevaFila()])}
            className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300"
          >
            Agregar salida
          </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]">Producto</th>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]">Cuanto salio</th>
              <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Lleva c/u {source && <span className="normal-case">({source.baseUnitLabel})</span>}
              </th>
              <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">Costo c/u</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const output = row.productId ? porId.get(row.productId) : undefined;
              const calculado = resultado?.outputs.find((o) => o.productId === row.productId);
              return (
                <tr key={row.key} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <select
                      name="outputProductId"
                      value={row.productId}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.key === row.key ? { ...r, productId: e.target.value, ref: "" } : r)),
                        )
                      }
                      className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">Elige el producto</option>
                      {sugeridos.length > 0 && (
                        <optgroup label={`Sale normalmente de ${source?.name ?? ""}`}>
                          {sugeridos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.portionQty ? ` · porcion de ${p.portionQty} ${p.portionUnit ?? ""}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label={sugeridos.length > 0 ? "Los demas productos" : "Productos"}>
                        {resto.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.portionQty ? ` · porcion de ${p.portionQty} ${p.portionUnit ?? ""}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {output?.extrasRecipeName && Number(output.extraCostPerUnit) > 0 && (
                      <p className="mt-1 text-xs text-neutral-500">
                        + {formatMoney(Number(output.extraCostPerUnit), 2)} de {output.extrasRecipeName}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        name="outputQty"
                        type="number"
                        step="any"
                        min="0"
                        value={row.qty}
                        onChange={(e) =>
                          setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)))
                        }
                        placeholder="0"
                        className="w-24 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-neutral-400">{output?.baseUnitLabel ?? ""}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      name="outputRefQty"
                      type="number"
                      step="any"
                      min="0"
                      value={row.ref}
                      onChange={(e) =>
                        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ref: e.target.value } : r)))
                      }
                      placeholder={refSugerida(row) || (rows.filter((r) => r.productId && r.qty).length > 1 ? "capturalo" : "no hace falta")}
                      className="w-28 rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {calculado ? (
                      <span className="font-medium text-neutral-900">
                        {formatMoney(calculado.unitCost.toNumber(), 2)}
                      </span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        className="text-xs text-neutral-400 hover:text-red-600"
                      >
                        Quitar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {calculo.error && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {calculo.error}
        </p>
      )}

      {resultado && source && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-neutral-500">Entro</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900">
                {formatMoney(resultado.totalCost.toNumber(), 2)}
              </p>
              <p className="text-xs text-neutral-500">
                {resultado.initialQty.toString()} {source.baseUnitLabel}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Salio</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900">
                {resultado.outputQtyInSource.toDecimalPlaces(3).toString()} {source.baseUnitLabel}
              </p>
              <p className="text-xs text-neutral-500">equivalente de producto</p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">
                {resultado.excedeEntrada ? "Sobrante" : "Merma"}
              </p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  resultado.excedeEntrada ? "text-amber-600" : "text-neutral-900"
                }`}
              >
                {resultado.mermaQty.abs().toDecimalPlaces(3).toString()} {source.baseUnitLabel}
              </p>
              <p className="text-xs text-neutral-500">
                {resultado.mermaPct.abs().toFixed(1)}% de lo que entro
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500">Rendimiento real</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900">
                {resultado.realYieldPct.toFixed(2)}%
              </p>
              <p className="text-xs text-neutral-500">de este corte</p>
            </div>
          </div>

          {resultado.excedeEntrada && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Salio mas producto del que capturaste que entro. Se puede guardar asi —pasa cuando
              la tanda venia de dos cajas o la bascula no cuadro—, pero el costo por pieza sale
              mas barato de lo real. Si el peso inicial estaba mal, corrigelo antes de guardar.
            </p>
          )}

          <p className="mt-4 text-xs text-neutral-500">
            Al guardar, cada producto que salio se queda con este costo. El rendimiento queda
            registrado en la transformacion y <b>no toca</b> la ficha de {source.name}: si quieres
            que este corte cambie su rendimiento en el catalogo, lo aplicas despues desde la lista.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="comment" className="text-sm font-medium text-neutral-700">
          Comentario (opcional)
        </label>
        <input
          id="comment"
          name="comment"
          placeholder="Ej. camaron de la caja chica, venia muy maltratado"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !resultado}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar transformacion"}
        </button>
        <Link href="/portioning" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
