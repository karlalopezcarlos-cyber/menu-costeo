"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { blockEnterSubmit } from "@/lib/ui/block-enter-submit";
import { resolveRefQtyPerUnit, type TransformationProduct } from "@/lib/transformations";
import type { TemplateState } from "./actions";

const initialState: TemplateState = {};

export type TemplateValues = {
  name: string;
  sourceProductId: string;
  outputs: { productId: string; refQtyPerUnit: string }[];
};

type Fila = { key: string; productId: string; ref: string };

function nuevaFila(productId = "", ref = ""): Fila {
  return { key: Math.random().toString(36).slice(2), productId, ref };
}

export default function TemplateForm({
  action,
  products,
  values,
  submitLabel,
}: {
  action: (prev: TemplateState | undefined, formData: FormData) => Promise<TemplateState>;
  products: TransformationProduct[];
  values?: TemplateValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [sourceId, setSourceId] = useState(values?.sourceProductId ?? "");
  const [rows, setRows] = useState<Fila[]>(
    values?.outputs.length
      ? values.outputs.map((o) => nuevaFila(o.productId, o.refQtyPerUnit))
      : [nuevaFila()],
  );
  const [name, setName] = useState(values?.name ?? "");
  const [nombreTocado, setNombreTocado] = useState(Boolean(values?.name));
  const [verTodos, setVerTodos] = useState(false);

  /**
   * Que productos se pueden meter en una plantilla: los de las categorias marcadas como que se
   * transforman, mas los de proceso, que son justo lo que sale de transformar.
   *
   * Mientras nadie marque una sola categoria se ofrecen todos: una organizacion que apenas
   * empieza no se puede quedar con el selector vacio sin entender por que.
   */
  const hayCategoriasMarcadas = useMemo(
    () => products.some((p) => p.isTransformable),
    [products],
  );
  const elegibles = useMemo(() => {
    if (verTodos || !hayCategoriasMarcadas) return products;
    const puestos = new Set([values?.sourceProductId, ...rows.map((r) => r.productId)].filter(Boolean));
    return products.filter((p) => p.isTransformable || p.isProcessed || puestos.has(p.id));
  }, [products, verTodos, hayCategoriasMarcadas, rows, values?.sourceProductId]);

  const porId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const source = sourceId ? porId.get(sourceId) : undefined;

  /** El nombre se arma solo mientras nadie lo escriba: "CAMARON -> CAMARON LIMPIO". */
  const nombreSugerido = useMemo(() => {
    if (!source) return "";
    const salidas = rows
      .map((r) => porId.get(r.productId)?.name)
      .filter((n): n is string => Boolean(n));
    if (salidas.length === 0) return "";
    return `${source.name} → ${salidas.join(" + ")}`;
  }, [source, rows, porId]);

  const nombreFinal = nombreTocado ? name : nombreSugerido;

  return (
    <form
      action={formAction}
      onKeyDown={blockEnterSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <div className="space-y-1">
        <label htmlFor="sourceProductId" className="text-sm font-medium text-neutral-700">
          Que entra
        </label>
        <select
          id="sourceProductId"
          name="sourceProductId"
          required
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Elige el producto</option>
          {elegibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isProcessed ? " (de proceso)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-700">Que sale</label>
          <div className="flex items-center gap-3">
            {hayCategoriasMarcadas && !verTodos && (
              <button
                type="button"
                onClick={() => setVerTodos(true)}
                className="text-xs text-neutral-500 hover:underline"
              >
                ¿No esta el producto? Ver todo el catalogo
              </button>
            )}
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, nuevaFila()])}
              className="text-xs font-medium text-neutral-600 hover:underline"
            >
              Agregar salida
            </button>
          </div>
        </div>

        {rows.map((row) => {
          const output = row.productId ? porId.get(row.productId) : undefined;
          const sugerida =
            source && output ? resolveRefQtyPerUnit(source.baseUnit, output) : null;
          return (
            <div key={row.key} className="flex items-center gap-2">
              <select
                name="outputProductId"
                value={row.productId}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.key === row.key ? { ...r, productId: e.target.value } : r)),
                  )
                }
                className="flex-1 rounded-md border border-neutral-200 px-2 py-2 text-sm"
              >
                <option value="">Elige el producto</option>
                {elegibles
                  .filter((p) => p.id !== sourceId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.portionQty ? ` · ${p.portionQty} ${p.portionUnit ?? ""}` : ""}
                    </option>
                  ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  name="outputRefQty"
                  type="number"
                  step="any"
                  min="0"
                  value={row.ref}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, ref: e.target.value } : r)),
                    )
                  }
                  placeholder={sugerida ? sugerida.toDecimalPlaces(6).toString() : "opcional"}
                  className="w-28 rounded-md border border-neutral-200 px-2 py-2 text-sm"
                  title="Cuanto del producto que entra lleva cada unidad de salida"
                />
                <span className="w-10 text-xs text-neutral-400">{source?.baseUnitLabel ?? ""}</span>
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  className="text-xs text-neutral-400 hover:text-red-600"
                >
                  Quitar
                </button>
              )}
            </div>
          );
        })}
        <p className="text-xs text-neutral-500">
          Lo de la derecha es cuanto del producto que entra lleva cada unidad que sale. Dejalo
          vacio y se usa el de la ficha; aqui solo se captura si esta plantilla usa otro. Las
          cantidades del dia nunca se guardan en la plantilla: esas cambian cada vez.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-neutral-700">
          Nombre de la plantilla
        </label>
        <input
          id="name"
          name="name"
          required
          value={nombreFinal}
          onChange={(e) => {
            setNombreTocado(true);
            setName(e.target.value);
          }}
          placeholder="CAMARON → CAMARON LIMPIO"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <p className="text-xs text-neutral-500">
          Se arma solo con lo que elegiste; cambialo si prefieres otro.
        </p>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
        <Link href="/portioning/templates" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
