"use client";

import { useActionState, useMemo, useState } from "react";
import { createProductionEntries } from "../../production/actions";
import { toggleItemCompleted, updateItemComment } from "../actions";
import { formatMoney } from "@/lib/format";
import type { ProductionResultRow } from "../view";

const initialState: { error?: string } = {};

export default function PlanningProductionTable({ rows }: { rows: ProductionResultRow[] }) {
  const [state, formAction, pending] = useActionState(createProductionEntries, initialState);
  const [completed, setCompleted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.completed])),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.netQty])),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.comment])),
  );

  const totalCost = useMemo(() => rows.reduce((sum, r) => sum + r.estimatedCost, 0), [rows]);
  const selectedCount = rows.filter((r) => completed[r.itemId]).length;

  function handleToggle(itemId: string, checked: boolean) {
    setCompleted((prev) => ({ ...prev, [itemId]: checked }));
    toggleItemCompleted(itemId, checked);
  }

  function handleCommentBlur(itemId: string, comment: string) {
    updateItemComment(itemId, comment);
  }

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((r) => completed[r.itemId])
          .map((r) => ({
            subRecipeId: r.subRecipeId,
            quantity: quantities[r.itemId] ?? r.netQty,
            comment: comments[r.itemId] ?? "",
          })),
      ),
    [rows, completed, quantities, comments],
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rows" value={rowsPayload} />

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Costo estimado de produccion</p>
        <p className="text-xl font-semibold text-neutral-900">{formatMoney(totalCost)}</p>
      </div>

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

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Subreceta</th>
              <th className="px-4 py-2 font-medium">Necesario total</th>
              <th className="px-4 py-2 font-medium">Existencia</th>
              <th className="px-4 py-2 font-medium">Cantidad a producir</th>
              <th className="px-4 py-2 font-medium">Comentario</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isChecked = !!completed[row.itemId];
              return (
                <tr
                  key={row.itemId}
                  className={`border-t border-neutral-100 ${isChecked ? "bg-emerald-50" : "bg-white"}`}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleToggle(row.itemId, e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className={`px-4 py-2 ${isChecked ? "text-neutral-400 line-through" : ""}`}>{row.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{row.grossQtyLabel}</td>
                  <td className="px-4 py-2 text-neutral-500">{row.onHandQtyLabel}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={quantities[row.itemId] ?? ""}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [row.itemId]: e.target.value }))}
                        className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-neutral-400">{row.unitLabel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={comments[row.itemId] ?? ""}
                      onChange={(e) => setComments((prev) => ({ ...prev, [row.itemId]: e.target.value }))}
                      onBlur={(e) => handleCommentBlur(row.itemId, e.target.value)}
                      placeholder="Opcional"
                      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <a
                      href={`/recipes/${row.subRecipeId}/execute?qty=${quantities[row.itemId] ?? row.netQty}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      Ver receta
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || selectedCount === 0}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending
          ? "Registrando..."
          : selectedCount > 0
            ? `Registrar produccion de ${selectedCount} subreceta${selectedCount === 1 ? "" : "s"} marcada${selectedCount === 1 ? "" : "s"}`
            : "Marca subrecetas para registrarlas como producidas"}
      </button>
    </form>
  );
}
