"use client";

import { useActionState, useMemo, useState } from "react";
import { createPurchaseOrder } from "../../orders/actions";
import { toggleItemCompleted, updateItemComment } from "../actions";
import PresentationQuantityInput from "../../_components/PresentationQuantityInput";
import { formatMoney } from "@/lib/format";
import type { PurchaseResultRow } from "../view";

type SupplierOption = { id: string; name: string };
type SortKey = "name" | "netQty";
type SortDir = "asc" | "desc";

const initialState: { error?: string } = {};

export default function PlanningPurchaseTable({
  rows,
  suppliers,
}: {
  rows: PurchaseResultRow[];
  suppliers: SupplierOption[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseOrder, initialState);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierId, setSupplierId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("netQty");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [completed, setCompleted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.completed])),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.netQty])),
  );
  const [presentationLabels, setPresentationLabels] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.itemId, r.comment])),
  );

  const totalCost = useMemo(() => rows.reduce((sum, r) => sum + r.estimatedCost, 0), [rows]);

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasUncategorized };
  }, [rows]);

  function matchesFilter(row: PurchaseResultRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (categoryFilter === "none" && row.categoryName !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
      return false;
    }
    return true;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleRows = useMemo(() => {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return rows
      .filter(matchesFilter)
      .sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name) * dirMultiplier;
        return (Number(a.netQty) - Number(b.netQty)) * dirMultiplier;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, categoryFilter, sortKey, sortDir]);

  function handleToggle(itemId: string, checked: boolean) {
    setCompleted((prev) => ({ ...prev, [itemId]: checked }));
    toggleItemCompleted(itemId, checked);
  }

  function handleCommentBlur(itemId: string, comment: string) {
    updateItemComment(itemId, comment);
  }

  const selectedCount = rows.filter((r) => completed[r.itemId]).length;

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows
          .filter((row) => completed[row.itemId])
          .map((row) => ({
            productId: row.productId,
            quantity: quantities[row.itemId] ?? row.netQty,
            presentationLabel: presentationLabels[row.itemId] ?? row.suggestedPresentationLabel ?? "",
          })),
      ),
    [rows, completed, quantities, presentationLabels],
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="rows" value={rowsPayload} />
      <input type="hidden" name="redirectTo" value="purchase" />

      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-500">Presupuesto de compra estimado</p>
        <p className="text-xl font-semibold text-neutral-900">{formatMoney(totalCost)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="planningSupplierId" className="text-sm font-medium text-neutral-700">
            Proveedor (opcional)
          </label>
          <select
            id="planningSupplierId"
            name="supplierId"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="planningComment" className="text-sm font-medium text-neutral-700">
            Comentarios del pedido (opcional)
          </label>
          <textarea
            id="planningComment"
            name="comment"
            rows={1}
            placeholder="Ej. entregar antes de las 10 am"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          {categoryOptions.names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {categoryOptions.hasUncategorized && <option value="none">Sin categoria</option>}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium">Categoria</th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Producto
                  {sortKey === "name" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Necesario total</th>
              <th className="px-4 py-2 font-medium">Existencia</th>
              <th className="px-4 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("netQty")}
                  className="flex items-center gap-1 hover:text-neutral-900"
                >
                  Falta por comprar
                  {sortKey === "netQty" && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Cantidad a pedir</th>
              <th className="px-4 py-2 font-medium">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
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
                  <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className={`px-4 py-2 ${isChecked ? "text-neutral-400 line-through" : ""}`}>{row.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{row.grossQtyLabel}</td>
                  <td className="px-4 py-2 text-neutral-500">{row.onHandQtyLabel}</td>
                  <td className="px-4 py-2 font-medium">
                    {Number(row.netQty).toLocaleString("es-MX", { maximumFractionDigits: 2 })} {row.unitLabel}
                  </td>
                  <td className="px-4 py-2">
                    <PresentationQuantityInput
                      baseUnit={row.baseUnit}
                      unitLabel={row.unitLabel}
                      presentations={row.presentations}
                      value={quantities[row.itemId] ?? row.netQty}
                      onChange={(qty) => setQuantities((prev) => ({ ...prev, [row.itemId]: qty }))}
                      onPresentationChange={(label) =>
                        setPresentationLabels((prev) => ({
                          ...prev,
                          [row.itemId]: label ?? row.suggestedPresentationLabel ?? "",
                        }))
                      }
                      initialPresentationLabel={row.suggestedPresentationLabel ?? undefined}
                      multiPresentation
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={comments[row.itemId] ?? ""}
                      onChange={(e) => setComments((prev) => ({ ...prev, [row.itemId]: e.target.value }))}
                      onBlur={(e) => handleCommentBlur(row.itemId, e.target.value)}
                      placeholder="Ej. tienda X"
                      className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
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
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending
          ? "Enviando a Registrar compra..."
          : selectedCount > 0
            ? `Enviar ${selectedCount} producto${selectedCount === 1 ? "" : "s"} marcado${selectedCount === 1 ? "" : "s"} a Registrar compra`
            : "Marca productos para enviarlos a Registrar compra"}
      </button>
    </form>
  );
}
