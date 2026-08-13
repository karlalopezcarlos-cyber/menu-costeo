"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { createRequisicion } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";
import { formatMoney } from "@/lib/format";

type ProductOption = { id: string; name: string; baseUnit: UnitValue; unitCost: number };
type SubRecipeOption = { id: string; name: string; yieldUnit: UnitValue; unitCost: number };
type SucursalOption = { id: string; name: string };
type ItemType = "product" | "subrecipe";

type Row = {
  key: string;
  itemType: ItemType;
  productId: string;
  subRecipeId: string;
  quantity: string;
  unit: UnitValue;
};

const GRID_COLS = "grid-cols-[1.5rem_6.5rem_minmax(0,2fr)_6rem_6rem_minmax(0,1.6fr)_1.5rem]";

function emptyRow(key: string, defaultUnit: UnitValue): Row {
  return { key, itemType: "product", productId: "", subRecipeId: "", quantity: "", unit: defaultUnit };
}

const initialState: { error?: string } = {};

export default function RequisicionForm({
  products,
  subRecipes,
  sucursales,
}: {
  products: ProductOption[];
  subRecipes: SubRecipeOption[];
  sucursales: SucursalOption[];
}) {
  const [state, formAction, pending] = useActionState(createRequisicion, initialState);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow("row-0", "PIECE")]);
  const nextKeyRef = useRef(1);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const subRecipeById = useMemo(() => new Map(subRecipes.map((r) => [r.id, r])), [subRecipes]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function setRowType(key: string, itemType: ItemType) {
    updateRow(key, { itemType, productId: "", subRecipeId: "", unit: "PIECE" });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`, "PIECE")]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function rowUnitCost(row: Row): number | null {
    if (row.itemType === "product") return productById.get(row.productId)?.unitCost ?? null;
    return subRecipeById.get(row.subRecipeId)?.unitCost ?? null;
  }

  function rowCost(row: Row): number | null {
    const unitCost = rowUnitCost(row);
    if (unitCost === null) return null;
    const qty = Number(row.quantity);
    if (!qty || qty <= 0) return null;
    return qty * unitCost;
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (rowCost(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products, subRecipes],
  );

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          itemType: row.itemType,
          productId: row.itemType === "product" ? row.productId : undefined,
          subRecipeId: row.itemType === "subrecipe" ? row.subRecipeId : undefined,
          quantity: row.quantity,
          unit: row.unit,
        })),
      ),
    [rows],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="toSucursalId" className="block text-sm font-medium text-neutral-700">
              Sucursal destino
            </label>
            <select
              id="toSucursalId"
              name="toSucursalId"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Selecciona una sucursal...</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="date" className="block text-sm font-medium text-neutral-700">
              Fecha
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label htmlFor="note" className="block text-sm font-medium text-neutral-700">
            Nota (opcional)
          </label>
          <input
            id="note"
            name="note"
            placeholder="Ej. surtido semanal"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-2">
          <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs font-medium text-neutral-500`}>
            <span></span>
            <span>Tipo</span>
            <span>Producto / Subreceta</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span>Costo</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const cost = rowCost(row);
            const hasSelection = row.itemType === "product" ? !!row.productId : !!row.subRecipeId;
            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <select
                  value={row.itemType}
                  onChange={(e) => setRowType(row.key, e.target.value as ItemType)}
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                >
                  <option value="product">Producto</option>
                  <option value="subrecipe">Subreceta</option>
                </select>

                {row.itemType === "product" ? (
                  <SearchableSelect
                    name={`productId-${row.key}`}
                    options={products.map((p) => ({ id: p.id, label: `${p.name} (${UNIT_LABELS[p.baseUnit]})` }))}
                    value={row.productId}
                    onChange={(id) => {
                      const selected = productById.get(id);
                      updateRow(row.key, { productId: id, unit: selected?.baseUnit ?? row.unit });
                    }}
                    placeholder="Buscar producto..."
                  />
                ) : (
                  <SearchableSelect
                    name={`subRecipeId-${row.key}`}
                    options={subRecipes.map((r) => ({ id: r.id, label: `${r.name} (${UNIT_LABELS[r.yieldUnit]})` }))}
                    value={row.subRecipeId}
                    onChange={(id) => {
                      const selected = subRecipeById.get(id);
                      updateRow(row.key, { subRecipeId: id, unit: selected?.yieldUnit ?? row.unit });
                    }}
                    placeholder="Buscar subreceta..."
                  />
                )}

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

                <div className="text-sm leading-tight text-neutral-700">
                  {hasSelection ? (
                    cost !== null ? (
                      <span>{formatMoney(cost)}</span>
                    ) : (
                      <span className="text-neutral-300">-</span>
                    )
                  ) : (
                    <span className="text-neutral-300">-</span>
                  )}
                </div>

                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-neutral-400 hover:text-red-600"
                    title="Quitar renglon"
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
            Costo total de la requisicion: <strong className="text-base">{formatMoney(grandTotal)}</strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + Agregar otro renglon
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : "Guardar requisicion"}
        </button>
        <Link href="/requisitions" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
