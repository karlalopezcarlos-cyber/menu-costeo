"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { createProductionEntries } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";
import { formatMoney } from "@/lib/format";

type SubRecipeOption = { id: string; name: string; yieldUnit: UnitValue; unitCost: number };

type Row = {
  key: string;
  subRecipeId: string;
  quantity: string;
  comment: string;
};

const GRID_COLS = "grid-cols-[1.5rem_minmax(0,2fr)_6rem_minmax(0,1.8fr)_minmax(0,1.6fr)_1.5rem]";

function emptyRow(key: string): Row {
  return { key, subRecipeId: "", quantity: "", comment: "" };
}

const initialState: { error?: string } = {};

export default function ProductionForm({ subRecipes }: { subRecipes: SubRecipeOption[] }) {
  const [state, formAction, pending] = useActionState(createProductionEntries, initialState);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow("row-0")]);
  const nextKeyRef = useRef(1);

  const subRecipeById = useMemo(() => new Map(subRecipes.map((s) => [s.id, s])), [subRecipes]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function rowCost(row: Row): number | null {
    const subRecipe = subRecipeById.get(row.subRecipeId);
    if (!subRecipe) return null;
    const qty = Number(row.quantity);
    if (!qty || qty <= 0) return null;
    return qty * subRecipe.unitCost;
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (rowCost(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, subRecipes],
  );

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          subRecipeId: row.subRecipeId,
          quantity: row.quantity,
          comment: row.comment,
        })),
      ),
    [rows],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="max-w-xs space-y-1">
          <label htmlFor="productionDate" className="text-sm font-medium text-neutral-700">
            Fecha de produccion
          </label>
          <input
            id="productionDate"
            name="productionDate"
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
            <span>Subreceta</span>
            <span>Cantidad</span>
            <span>Comentario</span>
            <span>Costo de la produccion</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const subRecipe = subRecipeById.get(row.subRecipeId);
            const cost = rowCost(row);
            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <SearchableSelect
                  name={`subRecipeId-${row.key}`}
                  options={subRecipes.map((s) => ({ id: s.id, label: `${s.name} (${UNIT_LABELS[s.yieldUnit]})` }))}
                  value={row.subRecipeId}
                  onChange={(id) => updateRow(row.key, { subRecipeId: id })}
                  placeholder="Buscar subreceta..."
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

                <input
                  value={row.comment}
                  onChange={(e) => updateRow(row.key, { comment: e.target.value })}
                  placeholder="Ej. lote de la manana"
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                />

                <div className="text-sm leading-tight text-neutral-700">
                  {subRecipe ? (
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
                    title="Quitar subreceta"
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
            Costo total de la produccion: <strong className="text-base">{formatMoney(grandTotal)}</strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + Agregar otra subreceta
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Guardando..." : rows.length > 1 ? `Guardar ${rows.length} producciones` : "Guardar produccion"}
        </button>
        <Link href="/production" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
