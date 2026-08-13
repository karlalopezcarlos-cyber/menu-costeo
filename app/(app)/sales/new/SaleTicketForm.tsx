"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createSaleTicket } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";
import { formatMoney } from "@/lib/format";

type RecipeOption = { id: string; name: string; sellingPrice: string | null };

type Row = {
  key: string;
  recipeId: string;
  quantity: string;
  unitPrice: string;
};

const GRID_COLS = "grid-cols-[1.5rem_minmax(0,2.2fr)_6rem_8rem_minmax(0,1.4fr)_1.5rem]";

function emptyRow(key: string): Row {
  return { key, recipeId: "", quantity: "1", unitPrice: "" };
}

const initialState: { error?: string } = {};

export default function SaleTicketForm({ recipes }: { recipes: RecipeOption[] }) {
  const [state, formAction, pending] = useActionState(createSaleTicket, initialState);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow("row-0")]);
  const nextKeyRef = useRef(1);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleRecipeChange(key: string, recipeId: string) {
    const recipe = recipeById.get(recipeId);
    updateRow(key, { recipeId, unitPrice: recipe?.sellingPrice ?? "" });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function rowTotal(row: Row): number | null {
    const qty = Number(row.quantity);
    const price = Number(row.unitPrice);
    if (!row.recipeId || !qty || qty <= 0 || price < 0 || Number.isNaN(price)) return null;
    return qty * price;
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (rowTotal(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          recipeId: row.recipeId,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
        })),
      ),
    [rows],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="max-w-xs space-y-1">
          <label htmlFor="saleDate" className="text-sm font-medium text-neutral-700">
            Fecha de venta
          </label>
          <input
            id="saleDate"
            name="saleDate"
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
            <span>Platillo</span>
            <span>Cantidad</span>
            <span>Precio</span>
            <span>Importe</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const total = rowTotal(row);
            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <SearchableSelect
                  name={`recipeId-${row.key}`}
                  options={recipes.map((r) => ({ id: r.id, label: r.name }))}
                  value={row.recipeId}
                  onChange={(id) => handleRecipeChange(row.key, id)}
                  placeholder="Buscar platillo..."
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

                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
                  />
                </div>

                <span className="text-sm text-neutral-700">
                  {total !== null ? formatMoney(total) : <span className="text-neutral-300">-</span>}
                </span>

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
            Total del ticket: <strong className="text-base">{formatMoney(grandTotal)}</strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + Agregar otro platillo
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Cobrando..." : "Cobrar venta"}
        </button>
        <Link href="/sales" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
