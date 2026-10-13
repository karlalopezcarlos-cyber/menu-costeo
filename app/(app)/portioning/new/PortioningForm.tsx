"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import { createPortioning, type PortioningState } from "../actions";
import type { PortionableProduct, PortionOption } from "@/lib/portioning-options";
import { formatMoney } from "@/lib/format";

type Renglon = { key: number; recipeId: string; portions: string };

const initialState: PortioningState = {};

export default function PortioningForm({
  products,
  options,
}: {
  products: PortionableProduct[];
  options: PortionOption[];
}) {
  const [state, formAction, pending] = useActionState(createPortioning, initialState);
  const [productId, setProductId] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([{ key: 1, recipeId: "", portions: "" }]);

  const product = products.find((p) => p.id === productId) ?? null;
  // Una receta solo aparece si lleva el producto elegido entre sus ingredientes.
  const recetasDelProducto = options.filter((o) => o.productId === productId);

  // El mismo calculo que hace el servidor, para que veas el resultado antes de guardar.
  const resumen = useMemo(() => {
    if (!product) return null;
    const entrada = new Decimal(initialQty || "0");
    if (entrada.lte(0)) return null;

    let porcionado = new Decimal(0);
    let totalPorciones = 0;
    const detalle: {
      name: string;
      portions: number;
      peso: Decimal;
      extra: Decimal;
      pesoPorcion: Decimal;
    }[] = [];

    for (const r of renglones) {
      const opcion = recetasDelProducto.find((o) => o.recipeId === r.recipeId);
      const porciones = Number(r.portions);
      if (!opcion || !Number.isInteger(porciones) || porciones <= 0) continue;
      const pesoPorcion = new Decimal(opcion.baseQtyPerPortion);
      const peso = pesoPorcion.times(porciones);
      porcionado = porcionado.plus(peso);
      totalPorciones += porciones;
      detalle.push({
        name: opcion.recipeName,
        portions: porciones,
        peso,
        extra: new Decimal(opcion.extraCostPerPortion),
        pesoPorcion,
      });
    }

    if (totalPorciones === 0) return null;

    // Lo que entro se valua al precio de compra: el costo del catalogo ya trae el rendimiento.
    const costoTotal = entrada.times(new Decimal(product.grossUnitCost));
    const rendimiento = porcionado.dividedBy(entrada).times(100);
    const excede = porcionado.gt(entrada);

    return {
      entrada,
      porcionado,
      merma: entrada.minus(porcionado),
      rendimiento,
      costoTotal,
      excede,
      detalle: detalle.map((d) => {
        const costoBase = porcionado.isZero()
          ? new Decimal(0)
          : costoTotal.times(d.peso).dividedBy(porcionado).dividedBy(d.portions);
        return {
          ...d,
          costoBase,
          costoReal: costoBase.plus(d.extra),
          costoTeorico: d.pesoPorcion.times(new Decimal(product.currentUnitCost)).plus(d.extra),
        };
      }),
    };
  }, [product, initialQty, renglones, recetasDelProducto]);

  const unidad = product?.baseUnitLabel ?? "";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />

      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:grid-cols-3">
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

        <div className="space-y-1">
          <label htmlFor="product" className="text-sm font-medium text-neutral-700">
            Producto que porcionaste
          </label>
          <select
            id="product"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setRenglones([{ key: 1, recipeId: "", portions: "" }]);
            }}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Elige un producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="initialQty" className="text-sm font-medium text-neutral-700">
            Peso inicial {unidad && <span className="text-neutral-400">({unidad})</span>}
          </label>
          <input
            id="initialQty"
            name="initialQty"
            type="number"
            step="0.0001"
            min="0"
            required
            value={initialQty}
            onChange={(e) => setInitialQty(e.target.value)}
            placeholder="1"
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          {product && (
            <p className="text-xs text-neutral-500">
              Compra: {formatMoney(Number(product.grossUnitCost), 2)} por {unidad} · rendimiento
              capturado hoy: {Number(product.yieldPercentage)}% · costo aprovechable{" "}
              {formatMoney(Number(product.currentUnitCost), 2)}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Porciones que salieron</h2>
          <p className="text-xs text-neutral-500">
            Solo aparecen las recetas marcadas como porcion. Puedes capturar varios tamanos del mismo corte.
          </p>
        </div>

        {products.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Todavia no hay nada que porcionar. Crea una receta en Recetas —por ejemplo
            &quot;CAMARON 80 G&quot;, que rinde 1 PZA y lleva 80 g de camaron— y marca la casilla
            &quot;Es una porcion&quot;.
          </p>
        ) : (
          <>
            {renglones.map((r, index) => (
              <div key={r.key} className="grid grid-cols-[1fr_120px_40px] items-end gap-2">
                <div className="space-y-1">
                  {index === 0 && <span className="text-xs font-medium text-neutral-500">Receta de porcion</span>}
                  <select
                    name="outputRecipeId"
                    value={r.recipeId}
                    onChange={(e) =>
                      setRenglones((prev) =>
                        prev.map((x) => (x.key === r.key ? { ...x, recipeId: e.target.value } : x)),
                      )
                    }
                    className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <option value="">
                      {productId ? "Elige la porcion" : "Primero elige el producto"}
                    </option>
                    {recetasDelProducto.map((o) => (
                      <option key={o.recipeId} value={o.recipeId}>
                        {o.recipeName} — {Number(o.baseQtyPerPortion).toLocaleString("es-MX", { maximumFractionDigits: 4 })}{" "}
                        {unidad} por {o.portionUnitLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  {index === 0 && <span className="text-xs font-medium text-neutral-500">Porciones</span>}
                  <input
                    name="outputPortions"
                    type="number"
                    min="1"
                    step="1"
                    value={r.portions}
                    onChange={(e) =>
                      setRenglones((prev) =>
                        prev.map((x) => (x.key === r.key ? { ...x, portions: e.target.value } : x)),
                      )
                    }
                    placeholder="20"
                    className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRenglones((prev) => (prev.length === 1 ? prev : prev.filter((x) => x.key !== r.key)))}
                  disabled={renglones.length === 1}
                  className="h-9 rounded-md border border-neutral-200 text-sm text-neutral-500 transition-colors hover:border-neutral-300 hover:text-red-600 disabled:opacity-30"
                  aria-label="Quitar renglon"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setRenglones((prev) => [...prev, { key: Math.max(...prev.map((x) => x.key)) + 1, recipeId: "", portions: "" }])
              }
              className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
            >
              + Agregar otro tamano de porcion
            </button>
          </>
        )}
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
              Las porciones suman {resumen.porcionado.toFixed(3)} {unidad} y solo entraron{" "}
              {resumen.entrada.toFixed(3)} {unidad}. Revisa el peso inicial o el numero de porciones.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Entro</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                    {resumen.entrada.toFixed(3)} {unidad}
                  </p>
                  <p className="text-xs text-neutral-500">{formatMoney(resumen.costoTotal.toNumber(), 2)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Porcionado</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                    {resumen.porcionado.toFixed(3)} {unidad}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Merma</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                    {resumen.merma.toFixed(3)} {unidad}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">Rendimiento real</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">
                    {resumen.rendimiento.toFixed(2)}%
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-brand-200 pt-3">
                {resumen.detalle.map((d) => (
                  <p key={d.name} className="text-sm text-neutral-700">
                    {d.portions} × {d.name} — <b>{formatMoney(d.costoReal.toNumber(), 2)} por pieza</b>
                    <span className="text-neutral-500">
                      {" "}
                      (la receta dice {formatMoney(d.costoTeorico.toNumber(), 2)}
                      {d.extra.gt(0) ? `, incluye ${formatMoney(d.extra.toNumber(), 2)} de otros ingredientes` : ""})
                    </span>
                  </p>
                ))}
                {product && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Al guardar, el rendimiento de {product.name} se actualiza con el promedio de sus
                    ultimos porcionamientos.
                  </p>
                )}
              </div>
            </>
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
          placeholder="Ej. camaron de la entrega del martes, venia con mucha cabeza"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !productId || resumen?.excede}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar porcionamiento"}
        </button>
        <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
