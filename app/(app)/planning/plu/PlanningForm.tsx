"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { runPlanning, type PendingStoreDemand } from "../actions";
import type { PlanningRunView } from "../view";
import SearchableSelect from "../../_components/SearchableSelect";
import PlanningProductionTable from "./PlanningProductionTable";
import PlanningPurchaseTable from "./PlanningPurchaseTable";

type RecipeOption = { id: string; name: string };
type SupplierOption = { id: string; name: string };

type Row = { key: string; recipeId: string; quantity: string };

const GRID_COLS = "grid-cols-[1.5rem_minmax(0,2.5fr)_8rem_6rem_1.5rem]";

function emptyRow(key: string): Row {
  return { key, recipeId: "", quantity: "" };
}

function rowsFromTargets(targets: { recipeId: string; quantity: string }[]): Row[] {
  if (targets.length === 0) return [emptyRow("row-0")];
  return targets.map((t, i) => ({ key: `row-${i}`, recipeId: t.recipeId, quantity: t.quantity }));
}

const initialState: { error?: string } = {};

export default function PlanningForm({
  recipes,
  suppliers,
  initialRun,
  pendingStoreDemand,
}: {
  recipes: RecipeOption[];
  suppliers: SupplierOption[];
  initialRun: PlanningRunView | null;
  pendingStoreDemand: PendingStoreDemand[];
}) {
  const [state, formAction, pending] = useActionState(runPlanning, initialState);
  const [showForm, setShowForm] = useState(!initialRun);
  const [rows, setRows] = useState<Row[]>(() => rowsFromTargets(initialRun?.targets ?? []));
  const nextKeyRef = useRef(rows.length);

  // Cuando llega un run nuevo (primera vez calculado, o tras "Recalcular"), se colapsa el
  // formulario y se sincronizan los renglones con los targets que se acaban de guardar.
  useEffect(() => {
    if (initialRun) {
      setShowForm(false);
      setRows(rowsFromTargets(initialRun.targets));
      nextKeyRef.current = initialRun.targets.length || 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRun?.id]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  // Suma la demanda de pedidos pendientes de la tienda en linea a los renglones ya capturados (en
  // vez de reemplazarlos), por si el usuario ya habia agregado ventas esperadas manualmente.
  function loadPendingStoreDemand() {
    setRows((prev) => {
      const next = prev.filter((row) => row.recipeId);
      for (const demand of pendingStoreDemand) {
        const existing = next.find((row) => row.recipeId === demand.recipeId);
        if (existing) {
          existing.quantity = String(Number(existing.quantity || "0") + Number(demand.quantity));
        } else {
          next.push({ key: `row-${nextKeyRef.current++}`, recipeId: demand.recipeId, quantity: demand.quantity });
        }
      }
      return next.length > 0 ? [...next] : [emptyRow("row-0")];
    });
  }

  const rowsPayload = JSON.stringify(
    rows.map((row) => ({ recipeId: row.recipeId, quantity: row.quantity })),
  );

  return (
    <div className="space-y-6">
      {initialRun && !showForm && (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">Calculado el {initialRun.createdAtLabel}.</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-neutral-700 hover:underline"
          >
            Recalcular proyeccion
          </button>
        </div>
      )}

      {showForm && (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="rows" value={rowsPayload} />

          {pendingStoreDemand.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-600">
                Tienes {pendingStoreDemand.length} platillo{pendingStoreDemand.length === 1 ? "" : "s"} con
                pedidos pendientes en tu tienda en linea.
              </p>
              <button
                type="button"
                onClick={loadPendingStoreDemand}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cargar pedidos pendientes
              </button>
            </div>
          )}

          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <div className="space-y-2">
              <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs font-medium text-neutral-500`}>
                <span></span>
                <span>Platillo</span>
                <span>Cantidad a vender</span>
                <span></span>
                <span></span>
              </div>

              {rows.map((row, index) => (
                <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                  <span className="text-xs text-neutral-400">{index + 1}</span>

                  <SearchableSelect
                    name={`recipeId-${row.key}`}
                    options={recipes.map((r) => ({ id: r.id, label: r.name }))}
                    value={row.recipeId}
                    onChange={(id) => updateRow(row.key, { recipeId: id })}
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

                  {row.recipeId && Number(row.quantity) > 0 ? (
                    <a
                      href={`/recipes/${row.recipeId}/execute?qty=${row.quantity}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      Ver receta
                    </a>
                  ) : (
                    <span />
                  )}

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
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addRow}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              + Agregar otro platillo
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {pending ? "Calculando..." : initialRun ? "Recalcular proyeccion" : "Calcular proyeccion"}
            </button>
            {initialRun && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm text-neutral-500 hover:underline"
              >
                Cancelar
              </button>
            )}
          </div>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        </form>
      )}

      {initialRun && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-900">Que producir</h2>
            {initialRun.productionNeeds.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Ya tienes suficiente de todas las subrecetas necesarias: no hace falta producir nada.
              </p>
            ) : (
              <PlanningProductionTable key={initialRun.id} rows={initialRun.productionNeeds} />
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-900">Que comprar</h2>
            {initialRun.purchaseNeeds.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Ya tienes suficiente de todos los productos necesarios: no hace falta comprar nada.
              </p>
            ) : (
              <PlanningPurchaseTable key={initialRun.id} rows={initialRun.purchaseNeeds} suppliers={suppliers} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
