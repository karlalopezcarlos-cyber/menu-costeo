"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { convertQty, removeYieldFactor, UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { createWasteEntries } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";
import { formatMoney } from "@/lib/format";

type CostBasis = "net" | "gross";

type ProductOption = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  currentUnitCost: string;
  yieldPercentage: string;
};

type Row = {
  key: string;
  productId: string;
  quantity: string;
  unit: UnitValue;
  comment: string;
  costBasis: CostBasis;
};

const GRID_COLS = "grid-cols-[1.5rem_minmax(0,2fr)_6rem_6rem_minmax(0,1.8fr)_minmax(0,1.9fr)_1.5rem]";

function emptyRow(key: string): Row {
  return { key, productId: "", quantity: "", unit: "ML", comment: "", costBasis: "net" };
}

const initialState: { error?: string } = {};

export default function WasteForm({ products }: { products: ProductOption[] }) {
  const [state, formAction, pending] = useActionState(createWasteEntries, initialState);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow("row-0")]);
  const nextKeyRef = useRef(1);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleProductChange(key: string, productId: string) {
    const product = productById.get(productId);
    updateRow(key, { productId, unit: product?.baseUnit ?? "ML" });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function unitCostOf(row: Row): number | null {
    const product = productById.get(row.productId);
    if (!product) return null;
    const netUnitCost = Number(product.currentUnitCost);
    const yieldPercentage = Number(product.yieldPercentage);
    if (row.costBasis === "gross" && yieldPercentage !== 100) {
      return removeYieldFactor(netUnitCost, yieldPercentage).toNumber();
    }
    return netUnitCost;
  }

  function isIncompatible(row: Row): boolean {
    const product = productById.get(row.productId);
    if (!product) return false;
    return UNIT_META[row.unit].type !== UNIT_META[product.baseUnit].type;
  }

  function rowCost(row: Row): number | null {
    const product = productById.get(row.productId);
    if (!product) return null;
    const qty = Number(row.quantity);
    if (!qty || qty <= 0) return null;
    const unitCost = unitCostOf(row);
    if (unitCost === null || isIncompatible(row)) return null;
    try {
      const qtyInBase = convertQty(qty, row.unit, product.baseUnit);
      return qtyInBase.toNumber() * unitCost;
    } catch {
      return null;
    }
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (rowCost(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products],
  );

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          productId: row.productId,
          quantity: row.quantity,
          unit: row.unit,
          comment: row.comment,
          costBasis: row.costBasis,
        })),
      ),
    [rows],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="max-w-xs space-y-1">
          <label htmlFor="wasteDate" className="text-sm font-medium text-neutral-700">
            Fecha de merma
          </label>
          <input
            id="wasteDate"
            name="wasteDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-2">
          <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs font-medium text-neutral-500`}>
            <span></span>
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span>Comentario</span>
            <span>Costo de la merma</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const product = productById.get(row.productId);
            const cost = rowCost(row);
            const incompatible = isIncompatible(row);
            const hasYield = !!product && Number(product.yieldPercentage) !== 100;
            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <SearchableSelect
                  name={`productId-${row.key}`}
                  options={products.map((p) => ({ id: p.id, label: `${p.name} (${UNIT_LABELS[p.baseUnit]})` }))}
                  value={row.productId}
                  onChange={(id) => handleProductChange(row.key, id)}
                  placeholder="Buscar producto..."
                />

                <input
                  type="number"
                  step="any"
                  min="0"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  placeholder="0"
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                />

                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, { unit: e.target.value as UnitValue })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>

                <input
                  value={row.comment}
                  onChange={(e) => updateRow(row.key, { comment: e.target.value })}
                  placeholder="Ej. se cayo, caduco..."
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                />

                <div className="text-sm leading-tight text-neutral-700">
                  {!product ? (
                    <span className="text-neutral-300">-</span>
                  ) : incompatible ? (
                    <span
                      className="text-red-600"
                      title={`La unidad no es compatible con la unidad base del producto (${UNIT_LABELS[product.baseUnit]}).`}
                    >
                      Unidad incompatible
                    </span>
                  ) : cost !== null ? (
                    <span>{formatMoney(cost)}</span>
                  ) : (
                    <span className="text-neutral-300">-</span>
                  )}
                  {hasYield && (
                    <select
                      value={row.costBasis}
                      onChange={(e) => updateRow(row.key, { costBasis: e.target.value as CostBasis })}
                      title={`Rendimiento configurado: ${Number(product!.yieldPercentage)}%`}
                      className="ml-2 rounded border border-neutral-300 px-1 py-0.5 text-xs text-neutral-600"
                    >
                      <option value="net">Con rendimiento</option>
                      <option value="gross">De compra</option>
                    </select>
                  )}
                </div>

                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-neutral-400 hover:text-red-600"
                    title="Quitar producto"
                  >
                    ✕
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end border-t border-neutral-100 pt-3">
          <p className="text-sm text-neutral-700">
            Costo total de la merma: <strong className="text-base">{formatMoney(grandTotal)}</strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + Agregar otro producto
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : rows.length > 1 ? `Guardar ${rows.length} mermas` : "Guardar merma"}
        </button>
        <Link href="/waste" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
