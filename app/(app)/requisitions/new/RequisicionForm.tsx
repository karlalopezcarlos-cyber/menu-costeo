"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS, type UnitValue } from "@/lib/units";
import { createRequisicion } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";
import { formatMoney } from "@/lib/format";

/** `unitPrice` es el precio de venta interna de esta sucursal. Null = el renglon va a costo. */
type ProductOption = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  unitCost: number;
  unitPrice: number | null;
  /** Tasa de IVA de la venta interna, en por ciento. 0 = sin IVA. */
  ivaRate: number;
};
type SubRecipeOption = {
  id: string;
  name: string;
  yieldUnit: UnitValue;
  unitCost: number;
  unitPrice: number | null;
  ivaRate: number;
};
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

const GRID_COLS =
  "grid-cols-[1.25rem_6rem_minmax(0,1.8fr)_5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_1.25rem]";

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

  /** El precio de venta interna del renglon. Null = esta sucursal no le puso precio. */
  function rowUnitPrice(row: Row): number | null {
    if (row.itemType === "product") return productById.get(row.productId)?.unitPrice ?? null;
    return subRecipeById.get(row.subRecipeId)?.unitPrice ?? null;
  }

  function rowQty(row: Row): number | null {
    const qty = Number(row.quantity);
    return !qty || qty <= 0 ? null : qty;
  }

  function rowCost(row: Row): number | null {
    const unitCost = rowUnitCost(row);
    const qty = rowQty(row);
    if (unitCost === null || qty === null) return null;
    return qty * unitCost;
  }

  function rowIvaRate(row: Row): number {
    if (row.itemType === "product") return productById.get(row.productId)?.ivaRate ?? 0;
    return subRecipeById.get(row.subRecipeId)?.ivaRate ?? 0;
  }

  /**
   * Lo que se le cobra a la otra sucursal, SIN IVA. Sin precio capturado el traspaso va a
   * costo, y un traspaso a costo no traslada impuesto.
   */
  function rowVenta(row: Row): number | null {
    const qty = rowQty(row);
    if (qty === null) return null;
    const unitPrice = rowUnitPrice(row);
    if (unitPrice !== null) return qty * unitPrice;
    return rowCost(row);
  }

  /** El IVA trasladado del renglon. Solo lo causa lo que tiene precio capturado. */
  function rowIva(row: Row): number {
    const venta = rowVenta(row);
    if (venta === null || rowUnitPrice(row) === null) return 0;
    return (venta * rowIvaRate(row)) / 100;
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (rowCost(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products, subRecipes],
  );

  const grandVenta = useMemo(
    () => rows.reduce((sum, row) => sum + (rowVenta(row) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products, subRecipes],
  );

  const grandIva = useMemo(
    () => rows.reduce((sum, row) => sum + rowIva(row), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, products, subRecipes],
  );

  const grandIngreso = grandVenta - grandTotal;

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

      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="toSucursalId" className="block text-sm font-medium text-neutral-700">
              Sucursal destino
            </label>
            <select
              id="toSucursalId"
              name="toSucursalId"
              required
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-5">
        <div className="space-y-2">
          <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs font-medium text-neutral-500`}>
            <span></span>
            <span>Tipo</span>
            <span>Producto / Subreceta</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span>Costo</span>
            <span>Venta s/IVA</span>
            <span>IVA</span>
            <span>Total</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const cost = rowCost(row);
            const venta = rowVenta(row);
            const iva = rowIva(row);
            const tasa = rowIvaRate(row);
            const conPrecio = rowUnitPrice(row) !== null;
            const hasSelection = row.itemType === "product" ? !!row.productId : !!row.subRecipeId;
            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-center gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <select
                  value={row.itemType}
                  onChange={(e) => setRowType(row.key, e.target.value as ItemType)}
                  className="w-full rounded-md border border-neutral-200 px-2 py-2 text-sm"
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
                  className="w-full rounded-md border border-neutral-200 px-2 py-2 text-sm"
                />

                <select
                  value={row.unit}
                  onChange={(e) => updateRow(row.key, { unit: e.target.value as UnitValue })}
                  className="w-full rounded-md border border-neutral-200 px-2 py-2 text-sm"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>

                <div className="text-sm leading-tight text-neutral-700">
                  {hasSelection && cost !== null ? (
                    <span>{formatMoney(cost)}</span>
                  ) : (
                    <span className="text-neutral-300">-</span>
                  )}
                </div>

                <div className="text-sm leading-tight text-neutral-700">
                  {hasSelection && venta !== null ? (
                    <span className={conPrecio ? "" : "text-neutral-400"} title={conPrecio ? undefined : "Sin precio de traspaso: va a costo"}>
                      {formatMoney(venta)}
                    </span>
                  ) : (
                    <span className="text-neutral-300">-</span>
                  )}
                </div>

                <div className="text-sm leading-tight text-neutral-500">
                  {hasSelection && venta !== null && conPrecio && tasa > 0 ? (
                    <span title={`IVA ${tasa}%`}>{formatMoney(iva)}</span>
                  ) : (
                    <span className="text-neutral-300">-</span>
                  )}
                </div>

                <div className="text-sm leading-tight text-neutral-700">
                  {hasSelection && venta !== null ? (
                    <span>{formatMoney(venta + iva)}</span>
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

        <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-neutral-100 pt-3 text-sm text-neutral-600">
          <p>
            Costo: <strong className="text-neutral-800">{formatMoney(grandTotal)}</strong>
          </p>
          <p>
            Venta s/IVA: <strong className="text-neutral-800">{formatMoney(grandVenta)}</strong>
          </p>
          <p>
            IVA: <strong className="text-neutral-800">{formatMoney(grandIva)}</strong>
          </p>
          <p>
            Total: <strong className="text-neutral-800">{formatMoney(grandVenta + grandIva)}</strong>
          </p>
          <p className={grandIngreso < 0 ? "text-red-600" : ""}>
            Ingreso:{" "}
            <strong className={grandIngreso < 0 ? "" : "text-base text-neutral-900"}>
              {formatMoney(grandIngreso)}
            </strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
      >
        + Agregar otro renglon
      </button>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
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
