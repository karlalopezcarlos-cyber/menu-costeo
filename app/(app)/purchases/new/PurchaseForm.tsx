"use client";

import { useActionState, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import {
  applyYieldFactor,
  computeUnitCost,
  convertQty,
  UNITS,
  UNIT_LABELS,
  UNIT_META,
  type UnitValue,
} from "@/lib/units";
import { createPurchase } from "../actions";
import { deletePurchaseOrder } from "../../orders/[orderId]/actions";
import SearchableSelect from "../../_components/SearchableSelect";
import type { PresentationOption } from "../../_components/PresentationQuantityInput";
import { formatMoney } from "@/lib/format";

type ProductOption = {
  id: string;
  name: string;
  baseUnit: UnitValue;
  yieldPercentage: string;
  presentationUnitLabel: string | null;
  presentationUnitQty: string | null;
  presentations: PresentationOption[];
};
type SupplierOption = { id: string; name: string };
type LastPurchase = {
  label: string;
  qty: string;
  unit: UnitValue;
  totalPrice: string;
  unitCostBase: string | null;
};
export type PendingOrderOption = {
  id: string;
  folioLabel: string;
  supplierId: string | null;
  supplierName: string | null;
  items: { productId: string; presentationLabel: string; pending: number }[];
};

type Row = {
  key: string;
  productId: string;
  presentationLabel: string;
  presentationQty: string;
  presentationUnit: UnitValue;
  totalPrice: string;
  /** Solo UI: cantidad de piezas (ej. botellas) capturada para autollenar presentationQty. */
  pieceCount: string;
  /** Solo UI: id de la presentacion elegida del catalogo (ProductPresentation), o "" si es manual. */
  presentationChoiceId: string;
  /** Solo UI: cuantas piezas de la presentacion elegida. */
  presentationPieceCount: string;
};

const GRID_COLS = "grid-cols-[1.5rem_minmax(0,2.2fr)_7rem_5rem_6rem_minmax(0,1.8fr)_1.5rem]";

/** Si el texto es de un solo tramo tipo "1 COSTAL 25 KG" (no compuesto con " + "), separa el
 * numero de piezas del nombre de la presentacion para intentar matchearlo contra el catalogo. */
function parseSingleSegmentLabel(label: string): { count: number; name: string } | null {
  const trimmed = label.trim();
  if (!trimmed || trimmed.includes(" + ")) return null;
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, name: match[2] };
}

function emptyRow(key: string): Row {
  return {
    key,
    productId: "",
    presentationLabel: "",
    presentationQty: "",
    presentationUnit: "ML",
    totalPrice: "",
    pieceCount: "",
    presentationChoiceId: "",
    presentationPieceCount: "",
  };
}

const initialState: { error?: string } = {};

export default function PurchaseForm({
  products,
  suppliers,
  lastPurchaseByProduct,
  pendingOrders,
  initialPedidoId,
}: {
  products: ProductOption[];
  suppliers: SupplierOption[];
  lastPurchaseByProduct: Record<string, LastPurchase>;
  pendingOrders: PendingOrderOption[];
  initialPedidoId?: string;
}) {
  const [state, formAction, pending] = useActionState(createPurchase, initialState);
  const nextKeyRef = useRef(1);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const pendingOrderById = useMemo(() => new Map(pendingOrders.map((o) => [o.id, o])), [pendingOrders]);

  // Convierte los renglones pendientes de un pedido abierto en filas precargadas de esta compra:
  // si el pedido pidio una sola presentacion configurada (ej. "1 COSTAL 25 KG"), la reconoce y
  // precarga esa misma presentacion con las piezas pendientes; si no, cae a cantidad libre en la
  // unidad base. Tambien sugiere el precio a partir de la ultima compra registrada de ese producto.
  function rowsFromOrder(order: PendingOrderOption): Row[] {
    return order.items.map((item) => {
      const base = { ...emptyRow(`row-${nextKeyRef.current++}`), productId: item.productId };
      const product = productById.get(item.productId);
      if (!product) return base;

      const candidates = [
        ...(product.presentationUnitQty && product.presentationUnitLabel
          ? [
              {
                id: "legacy",
                label: product.presentationUnitLabel,
                quantity: product.presentationUnitQty,
                unit: product.baseUnit,
              },
            ]
          : []),
        ...product.presentations.map((p) => ({ id: p.id, label: p.label, quantity: p.quantity, unit: p.unit })),
      ];

      const parsed = parseSingleSegmentLabel(item.presentationLabel);
      const matched = parsed ? candidates.find((c) => c.label === parsed.name) : undefined;

      let fill: Partial<Row>;
      try {
        if (!matched) throw new Error("no match");
        const pieceCount = convertQty(item.pending, product.baseUnit, matched.unit).dividedBy(matched.quantity);
        const pieceCountStr = pieceCount.toDecimalPlaces(4).toString();
        fill =
          matched.id === "legacy"
            ? {
                pieceCount: pieceCountStr,
                presentationQty: String(item.pending),
                presentationUnit: product.baseUnit,
                presentationLabel: `${pieceCountStr} ${product.presentationUnitLabel}${pieceCount.equals(1) ? "" : "s"}`,
              }
            : {
                presentationChoiceId: matched.id,
                presentationPieceCount: pieceCountStr,
                presentationQty: String(item.pending),
                presentationUnit: matched.unit,
                presentationLabel: `${pieceCountStr} x ${matched.label}`,
              };
      } catch {
        fill = {
          presentationQty: String(item.pending),
          presentationUnit: product.baseUnit,
          presentationLabel: `${item.pending.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${UNIT_LABELS[product.baseUnit]}`,
        };
      }

      const lastPurchase = lastPurchaseByProduct[item.productId];
      const totalPrice = lastPurchase?.unitCostBase
        ? (Number(lastPurchase.unitCostBase) * item.pending).toFixed(2)
        : "";

      return { ...base, ...fill, totalPrice };
    });
  }

  const initialOrder = initialPedidoId ? pendingOrderById.get(initialPedidoId) : undefined;

  const [rows, setRows] = useState<Row[]>(() =>
    initialOrder && initialOrder.items.length > 0 ? rowsFromOrder(initialOrder) : [emptyRow("row-0")],
  );
  const [supplierId, setSupplierId] = useState(() => initialOrder?.supplierId ?? "");
  const [selectedPedidoId, setSelectedPedidoId] = useState(initialOrder ? initialOrder.id : "");

  function handlePendingOrderChange(orderId: string) {
    setSelectedPedidoId(orderId);
    if (!orderId) return;
    const order = pendingOrderById.get(orderId);
    if (!order) return;
    if (order.supplierId) setSupplierId(order.supplierId);
    setRows(order.items.length > 0 ? rowsFromOrder(order) : [emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function handleProductChange(key: string, productId: string) {
    const product = productById.get(productId);
    // Si el producto ya tiene una presentacion fija (ej. Botella = 750 ML), la presentacion se
    // autocompleta con la cantidad de piezas: no se usa la sugerencia de la ultima compra, que
    // podria traer texto libre de antes de configurar la presentacion (ej. "1 BOTELLA").
    const suggestion = product?.presentationUnitQty ? undefined : lastPurchaseByProduct[productId];
    updateRow(key, {
      productId,
      presentationLabel: suggestion?.label ?? "",
      presentationQty: suggestion?.qty ?? "",
      presentationUnit: suggestion?.unit ?? product?.baseUnit ?? "ML",
      totalPrice: suggestion?.totalPrice ?? "",
      pieceCount: "",
      presentationChoiceId: "",
      presentationPieceCount: "",
    });
  }

  function handlePieceCountChange(key: string, value: string, product: ProductOption) {
    const unitQty = Number(product.presentationUnitQty ?? 0);
    const count = Number(value);
    const computedQty = value && !Number.isNaN(count) ? (count * unitQty).toString() : "";
    updateRow(key, {
      pieceCount: value,
      presentationQty: computedQty,
      presentationUnit: product.baseUnit,
      presentationLabel: value
        ? `${value} ${product.presentationUnitLabel}${count === 1 ? "" : "s"}`
        : "",
    });
  }

  function handlePresentationChoiceChange(key: string, presentationId: string, product: ProductOption) {
    if (!presentationId) {
      updateRow(key, { presentationChoiceId: "", presentationPieceCount: "", presentationQty: "" });
      return;
    }
    const presentation = product.presentations.find((p) => p.id === presentationId);
    if (!presentation) return;
    updateRow(key, {
      presentationChoiceId: presentationId,
      presentationPieceCount: "",
      presentationQty: "",
      presentationUnit: presentation.unit,
      presentationLabel: presentation.label,
    });
  }

  function handlePresentationCountChange(key: string, value: string, product: ProductOption) {
    const row = rows.find((r) => r.key === key);
    const presentation = product.presentations.find((p) => p.id === row?.presentationChoiceId);
    if (!presentation) return;
    const count = Number(value);
    const computedQty =
      value && !Number.isNaN(count) ? (count * Number(presentation.quantity)).toString() : "";
    updateRow(key, {
      presentationPieceCount: value,
      presentationQty: computedQty,
      presentationUnit: presentation.unit,
      presentationLabel: value ? `${value} x ${presentation.label}` : presentation.label,
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(`row-${nextKeyRef.current++}`)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function rowPreview(row: Row) {
    const product = productById.get(row.productId);
    if (!product) return null;
    if (UNIT_META[row.presentationUnit].type !== UNIT_META[product.baseUnit].type) return null;
    try {
      const qty = new Decimal(row.presentationQty || 0);
      const price = new Decimal(row.totalPrice || 0);
      if (qty.lte(0) || price.lte(0)) return null;
      const grossCost = computeUnitCost(price, qty, row.presentationUnit, product.baseUnit);
      return applyYieldFactor(grossCost, product.yieldPercentage);
    } catch {
      return null;
    }
  }

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.totalPrice) || 0), 0),
    [rows],
  );

  const hasYieldAdjustedRow = rows.some((row) => {
    const product = productById.get(row.productId);
    return !!product && Number(product.yieldPercentage) !== 100;
  });

  const rowsPayload = useMemo(
    () =>
      JSON.stringify(
        rows.map((row) => ({
          productId: row.productId,
          presentationLabel: row.presentationLabel,
          presentationQty: row.presentationQty,
          presentationUnit: row.presentationUnit,
          totalPrice: row.totalPrice,
        })),
      ),
    [rows],
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="rows" value={rowsPayload} />
      <input type="hidden" name="purchaseOrderId" value={selectedPedidoId} />

      {pendingOrders.length > 0 && (
        <div className="space-y-1 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pendingOrder" className="text-sm font-medium text-neutral-700">
              Recibir pedido pendiente (opcional)
            </label>
            {selectedPedidoId && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("¿Eliminar este pedido? Esta accion no se puede deshacer.")) {
                    deletePurchaseOrder(selectedPedidoId);
                  }
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Eliminar pedido
              </button>
            )}
          </div>
          <select
            id="pendingOrder"
            value={selectedPedidoId}
            onChange={(e) => handlePendingOrderChange(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Sin pedido (compra libre)</option>
            {pendingOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.folioLabel} - {o.supplierName ?? "Sin proveedor"} ({o.items.length} producto
                {o.items.length === 1 ? "" : "s"} pendiente{o.items.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          {selectedPedidoId && (
            <p className="text-xs text-neutral-500">
              Se precargaron los productos pendientes de ese pedido con la cantidad que falta; ajusta
              presentacion, cantidad real y precio de cada uno. Al guardar, el pedido se actualiza con
              lo recibido.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-1">
          <label htmlFor="purchaseDate" className="text-sm font-medium text-neutral-700">
            Fecha de compra
          </label>
          <input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="supplierId" className="text-sm font-medium text-neutral-700">
            Proveedor (opcional)
          </label>
          <select
            id="supplierId"
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
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="space-y-2">
          <div className={`grid ${GRID_COLS} gap-2 px-1 text-xs font-medium text-neutral-500`}>
            <span></span>
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span>Total</span>
            <span>Costo resultante</span>
            <span></span>
          </div>

          {rows.map((row, index) => {
            const product = productById.get(row.productId);
            const preview = rowPreview(row);
            const incompatible =
              !!product && UNIT_META[row.presentationUnit].type !== UNIT_META[product.baseUnit].type;
            const yieldAdjusted = !!product && Number(product.yieldPercentage) !== 100;

            let costCell: ReactNode;
            if (!product) {
              costCell = <span className="text-neutral-300">-</span>;
            } else if (incompatible) {
              costCell = (
                <span
                  className="text-red-600"
                  title={`La unidad de la presentacion no es compatible con la unidad base del producto (${UNIT_LABELS[product.baseUnit]}).`}
                >
                  Unidad incompatible
                </span>
              );
            } else if (preview) {
              costCell = (
                <span className="text-neutral-700">
                  {formatMoney(preview.toNumber(), 4)} / {UNIT_LABELS[product.baseUnit]}
                  {yieldAdjusted && (
                    <span className="text-amber-600"> (rinde {Number(product.yieldPercentage)}%)</span>
                  )}
                </span>
              );
            } else {
              costCell = <span className="text-neutral-300">-</span>;
            }

            return (
              <div key={row.key} className={`grid ${GRID_COLS} items-start gap-2 rounded-md px-1 py-1`}>
                <span className="text-xs text-neutral-400">{index + 1}</span>

                <SearchableSelect
                  name={`productId-${row.key}`}
                  options={products.map((p) => ({ id: p.id, label: `${p.name} (${UNIT_LABELS[p.baseUnit]})` }))}
                  value={row.productId}
                  onChange={(id) => handleProductChange(row.key, id)}
                  placeholder="Buscar producto..."
                />

                <div className="space-y-1">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={row.presentationQty}
                    onChange={(e) =>
                      updateRow(row.key, {
                        presentationQty: e.target.value,
                        presentationLabel: e.target.value
                          ? `${e.target.value} ${UNIT_LABELS[row.presentationUnit]}`
                          : "",
                        pieceCount: "",
                        presentationChoiceId: "",
                        presentationPieceCount: "",
                      })
                    }
                    placeholder="900"
                    className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                  />
                  {product?.presentationUnitQty && (
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <span>o</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={row.pieceCount}
                        onChange={(e) => handlePieceCountChange(row.key, e.target.value, product)}
                        placeholder="1"
                        className="w-14 rounded border border-neutral-300 px-1 py-0.5 text-xs"
                      />
                      <span>{product.presentationUnitLabel}(s)</span>
                    </div>
                  )}
                  {!!product?.presentations.length && (
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <span>o</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={row.presentationPieceCount}
                        onChange={(e) => handlePresentationCountChange(row.key, e.target.value, product)}
                        placeholder="1"
                        disabled={!row.presentationChoiceId}
                        className="w-12 rounded border border-neutral-300 px-1 py-0.5 text-xs disabled:bg-neutral-50"
                      />
                      <select
                        value={row.presentationChoiceId}
                        onChange={(e) => handlePresentationChoiceChange(row.key, e.target.value, product)}
                        className="rounded border border-neutral-300 px-1 py-0.5 text-xs"
                      >
                        <option value="">Presentacion...</option>
                        {product.presentations.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <select
                  value={row.presentationUnit}
                  onChange={(e) => updateRow(row.key, { presentationUnit: e.target.value as UnitValue })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
                >
                  {UNITS.map((unit) => (
                    <option
                      key={unit}
                      value={unit}
                      disabled={!!product && UNIT_META[unit].type !== UNIT_META[product.baseUnit].type}
                    >
                      {UNIT_LABELS[unit]}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={row.totalPrice}
                    onChange={(e) => updateRow(row.key, { totalPrice: e.target.value })}
                    placeholder="30"
                    className="w-full rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm font-medium"
                  />
                </div>

                <div className="text-sm leading-tight">{costCell}</div>

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

        {hasYieldAdjustedRow && (
          <p className="mt-3 text-xs text-amber-600">
            El aviso &quot;rinde X%&quot; indica que ese producto tiene merma configurada: el costo
            resultante ya esta dividido entre ese rendimiento y no solo entre el precio pagado.
          </p>
        )}

        <div className="mt-3 flex justify-end border-t border-neutral-100 pt-3">
          <p className="text-sm text-neutral-700">
            Total de la compra: <strong className="text-base">{formatMoney(grandTotal)}</strong>
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
          {pending ? "Guardando..." : rows.length > 1 ? `Guardar ${rows.length} compras` : "Guardar compra"}
        </button>
        <Link href="/purchases" className="text-sm text-neutral-500 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
