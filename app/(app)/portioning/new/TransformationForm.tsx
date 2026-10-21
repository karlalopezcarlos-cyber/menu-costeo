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
  // Con el catalogo completo en los selectores, encontrar el camaron entre cientos de productos
  // es el trabajo mas lento de la captura. Por omision solo se ofrece lo que aparece en alguna
  // plantilla, que es lo que de verdad se transforma; el resto sigue a un clic de distancia.
  const [soloPlantillas, setSoloPlantillas] = useState(true);
  /** Rendimiento tecleado. Vacio = el que sale de las cantidades capturadas. */
  const [rendimiento, setRendimiento] = useState("");

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

  // Si nadie marco categorias que se transformen, no hay con que filtrar y se ofrece todo.
  const hayCategoriasMarcadas = useMemo(
    () => products.some((p) => p.isTransformable),
    [products],
  );

  /** Lo que tiene sentido en una tablajeria: lo que se transforma y lo que sale de transformar. */
  const deTablajeria = useMemo(() => {
    if (!hayCategoriasMarcadas) return products;
    return products.filter((p) => p.isTransformable || p.isProcessed);
  }, [products, hayCategoriasMarcadas]);

  /**
   * Productos que pueden entrar: los que alguna plantilla usa como origen. Sin plantillas
   * todavia, se cae al criterio de categoria en vez de al catalogo completo.
   */
  const origenes = useMemo(() => {
    if (!soloPlantillas) return products;
    const ids = new Set(
      templates.length > 0 ? templates.map((t) => t.sourceProductId) : deTablajeria.map((p) => p.id),
    );
    // Lo ya elegido no se cae de la lista aunque el filtro lo excluya.
    if (sourceId) ids.add(sourceId);
    return products.filter((p) => ids.has(p.id));
  }, [products, templates, soloPlantillas, sourceId, deTablajeria]);

  /** Productos que pueden salir: los de las plantillas que parten de lo que entro. */
  const salidasPermitidas = useMemo(() => {
    if (!soloPlantillas) return null;
    if (templates.length === 0) {
      return hayCategoriasMarcadas ? new Set(deTablajeria.map((p) => p.id)) : null;
    }
    const ids = new Set<string>();
    for (const plantilla of templates) {
      if (sourceId && plantilla.sourceProductId !== sourceId) continue;
      for (const output of plantilla.outputs) ids.add(output.productId);
    }
    return ids;
  }, [templates, soloPlantillas, sourceId, deTablajeria, hayCategoriasMarcadas]);

  // Lo que normalmente sale de este producto va arriba y separado: es lo que se va a capturar el
  // 90% de las veces. Lo demas sigue disponible, porque el dia que se porciona otra cosa no hay
  // que pelear con la pantalla.
  const { sugeridos, resto } = useMemo(() => {
    let candidatos = products.filter((p) => p.id !== sourceId);
    if (salidasPermitidas) {
      // Lo que ya esta capturado en un renglon no desaparece por el filtro.
      const puestos = new Set(rows.map((r) => r.productId).filter(Boolean));
      candidatos = candidatos.filter((p) => salidasPermitidas.has(p.id) || puestos.has(p.id));
    }
    if (!sourceId) return { sugeridos: [], resto: candidatos };
    return {
      sugeridos: candidatos.filter((p) => p.defaultSourceProductId === sourceId),
      resto: candidatos.filter((p) => p.defaultSourceProductId !== sourceId),
    };
  }, [products, sourceId, salidasPermitidas, rows]);

  /**
   * Cuanto del producto que entra lleva cada unidad que sale. Manda el tecleado, luego la
   * ficha de la porcion, luego la conversion directa (un kilo limpio es un kilo crudo).
   *
   * Cuando no se puede deducir —piezas que salen de algo que se mide en kilos y nadie capturo
   * el gramaje— se despeja del rendimiento, que por omision es 100%: todo lo que entro se fue
   * en esas piezas. Antes aqui se usaba 1, que para una pieza significa "cada una pesa un
   * kilo", y de ahi salian rendimientos de 4000%.
   */
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
    const deLaFicha = resolveRefQtyPerUnit(source.baseUnit, output);
    if (deLaFicha) return deLaFicha;
    return refDesdeRendimiento(row);
  }

  /** Peso por unidad despejado del rendimiento: (lo que entro x rendimiento) / lo que salio. */
  function refDesdeRendimiento(row: OutputRow): Decimal | null {
    if (!row.qty) return null;
    let cantidad: Decimal;
    let entro: Decimal;
    try {
      cantidad = new Decimal(row.qty);
      entro = new Decimal(initialQty || "0");
    } catch {
      return null;
    }
    if (cantidad.lte(0) || entro.lte(0)) return null;

    let pct = new Decimal(100);
    if (rendimiento) {
      try {
        const tecleado = new Decimal(rendimiento);
        if (tecleado.gt(0)) pct = tecleado.lte(1) ? tecleado.times(100) : tecleado;
      } catch {
        // se queda en 100
      }
    }
    return entro.times(pct).dividedBy(100).dividedBy(cantidad);
  }

  function refSugerida(row: OutputRow): string {
    const output = porId.get(row.productId);
    if (!source || !output) return "";
    const ref = resolveRefQtyPerUnit(source.baseUnit, output);
    return ref ? ref.toDecimalPlaces(6).toString() : "";
  }

  /**
   * Del rendimiento a las piezas, en vez de al reves.
   *
   * Quien corta sabe lo que rinde su producto mucho antes de contar las piezas: tecleando 80%
   * sale cuantas porciones tendrian que salir de lo que entro. Si luego cuenta y salieron
   * otras, cambia la cantidad y el rendimiento se vuelve a calcular solo: los dos campos son
   * el mismo dato visto por los dos lados.
   *
   * Solo aplica con una salida: con dos tamanos a la vez no hay forma de saber cuanto del
   * rendimiento le toca a cada uno sin inventarlo.
   */
  const filasUsables = rows.filter((r) => r.productId);
  const puedeDespejar = Boolean(source) && filasUsables.length === 1 && Number(initialQty) > 0;

  /** true cuando el gramaje no se conoce: ahi el rendimiento define el peso, no la cantidad. */
  const gramajeDesconocido =
    puedeDespejar &&
    !filasUsables[0].ref &&
    !(source && porId.get(filasUsables[0].productId)
      ? resolveRefQtyPerUnit(source.baseUnit, porId.get(filasUsables[0].productId)!)
      : null);

  function aplicarRendimiento(raw: string) {
    setRendimiento(raw);
    // Sin gramaje, el rendimiento define cuanto pesa cada pieza y la cantidad no se toca.
    if (!raw || !puedeDespejar || !source || gramajeDesconocido) return;

    let pct: Decimal;
    try {
      pct = new Decimal(raw);
    } catch {
      return;
    }
    // Tolera que se capture 0.8 en vez de 80, que es como se dice en cocina.
    if (pct.gt(0) && pct.lte(1)) pct = pct.times(100);
    if (pct.lte(0)) return;

    const fila = filasUsables[0];
    const ref = refDe(fila);
    if (!ref || ref.lte(0)) return;

    const aprovechado = new Decimal(initialQty).times(pct).dividedBy(100);
    const cantidad = aprovechado.dividedBy(ref);
    const output = porId.get(fila.productId);
    // Las piezas son enteras: 54.3 porciones no existen.
    const valor =
      output?.baseUnit === "PIECE"
        ? cantidad.floor().toString()
        : cantidad.toDecimalPlaces(3).toString();

    setRows((prev) => prev.map((r) => (r.key === fila.key ? { ...r, qty: valor } : r)));
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
      {templates.length === 0 && (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Todavia no tienes plantillas.{" "}
          <Link href="/portioning/templates/new" className="font-medium text-brand-600 underline-offset-2 hover:underline">
            Crea las que haces siempre
          </Link>{" "}
          (CAMARON → CAMARON LIMPIO) y la proxima captura sera elegir una y teclear cantidades.
          Mientras tanto, aqui solo se ofrecen los productos de las categorias que marcaste como
          que se transforman, en{" "}
          <Link
            href="/settings/categories"
            className="font-medium text-brand-600 underline-offset-2 hover:underline"
          >
            Configuracion → Categorias
          </Link>
          .
        </p>
      )}

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
          <label className="flex items-center gap-2 pb-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              checked={soloPlantillas}
              onChange={(e) => setSoloPlantillas(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Solo los productos de mis plantillas
          </label>
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
            {origenes.map((p) => (
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
          {soloPlantillas ? (
            <button
              type="button"
              onClick={() => setSoloPlantillas(false)}
              className="text-xs text-neutral-500 hover:underline"
            >
              ¿No esta el producto? Ver todo el catalogo
            </button>
          ) : (
            <Link href="/portioning/portions/new" className="text-xs text-neutral-500 hover:underline">
              ¿Falta el producto que sale?
            </Link>
          )}
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
                        onChange={(e) => {
                          setRendimiento("");
                          setRows((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)),
                          );
                        }}
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
                      placeholder={refSugerida(row) || "capturalo"}
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
              <label htmlFor="rendimiento" className="text-xs font-medium text-neutral-500">
                Rendimiento
              </label>
              <div className="flex items-baseline gap-1">
                <input
                  id="rendimiento"
                  type="number"
                  step="any"
                  min="0"
                  value={rendimiento || resultado.realYieldPct.toFixed(2)}
                  onChange={(e) => aplicarRendimiento(e.target.value)}
                  disabled={!puedeDespejar}
                  className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-lg font-semibold tabular-nums text-neutral-900 disabled:border-transparent disabled:bg-transparent disabled:px-0"
                />
                <span className="text-lg font-semibold text-neutral-900">%</span>
              </div>
              <p className="text-xs text-neutral-500">
                {!puedeDespejar
                  ? `${resultado.outputQtyInSource.toDecimalPlaces(3).toString()} ${source.baseUnitLabel} equivalente`
                  : gramajeDesconocido
                    ? `Sin gramaje capturado, esto define la merma · cada una pesaria ${resultado.outputs[0]?.refQtyPerUnit.toDecimalPlaces(4).toString() ?? "?"} ${source.baseUnitLabel}`
                    : `Teclealo y se llena la cantidad · ${resultado.outputQtyInSource.toDecimalPlaces(3).toString()} ${source.baseUnitLabel}`}
              </p>
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
              <p className="text-xs font-medium text-neutral-500">Costo por unidad</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900">
                {resultado.outputs.length === 1
                  ? formatMoney(resultado.outputs[0].unitCost.toNumber(), 2)
                  : "varios"}
              </p>
              <p className="text-xs text-neutral-500">
                {resultado.outputs.length === 1
                  ? `de ${resultado.outputs[0].productName}`
                  : "ve el detalle en cada renglon"}
              </p>
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
