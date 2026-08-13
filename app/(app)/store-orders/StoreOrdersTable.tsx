"use client";

import { useMemo, useState } from "react";
import { markStoreOrderFulfilled, cancelStoreOrder, confirmStoreOrder, deleteStoreOrder } from "./actions";
import { formatMoney } from "@/lib/format";

export type StoreOrderRow = {
  id: string;
  folioLabel: string;
  dateLabel: string;
  customerName: string;
  customerPhone: string | null;
  fulfillmentType: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  deliveryAddress: string | null;
  deliveryFee: number;
  requestedDeliveryDateLabel: string | null;
  requestedDeliveryTime: string | null;
  total: number;
  confirmed: boolean;
  comment: string | null;
  packagingNotes: string | null;
  items: { name: string; quantity: number; unitPrice: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  fulfilled: "Atendido",
  cancelled: "Cancelado",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Paga al recoger",
  pending: "Pago pendiente de confirmar",
  paid: "Pagado",
  failed: "Pago fallido",
};

const PAYMENT_STYLES: Record<string, string> = {
  unpaid: "bg-neutral-100 text-neutral-600",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

function buildWhatsAppConfirmHref(row: StoreOrderRow): string | null {
  const digitsOnly = row.customerPhone ? row.customerPhone.replace(/\D/g, "") : "";
  if (!digitsOnly) return null;
  const message = `Hola ${row.customerName}! Hemos recibido tu pedido ${row.folioLabel}, gracias. En breve te confirmamos los detalles. Cualquier duda, escribenos por aqui.`;
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export default function StoreOrdersTable({ rows }: { rows: StoreOrderRow[] }) {
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");

  const visibleRows = useMemo(
    () => (statusFilter === "pending" ? rows.filter((r) => r.status === "pending") : rows),
    [rows, statusFilter],
  );

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter("pending")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            statusFilter === "pending" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          Pendientes ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            statusFilter === "all" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"
          }`}
        >
          Todos ({rows.length})
        </button>
      </div>

      <div className="space-y-3">
        {visibleRows.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white px-4 py-6 text-center text-neutral-400">
            {statusFilter === "pending" ? "No hay pedidos pendientes." : "Todavia no hay pedidos en linea."}
          </p>
        )}
        {visibleRows.map((row) => (
          <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">{row.folioLabel}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status] ?? ""}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {row.fulfillmentType === "pickup" ? "Recoger en tienda" : "Envio"}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${PAYMENT_STYLES[row.paymentStatus] ?? ""}`}>
                    {PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus}
                  </span>
                  {row.confirmed && (
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                      ✓ Confirmado con cliente
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {row.customerName}
                  {row.customerPhone ? ` · ${row.customerPhone}` : ""} · {row.dateLabel}
                </p>
                {row.fulfillmentType === "delivery" ? (
                  <p className="mt-1 text-sm text-neutral-500">
                    📍 {row.deliveryAddress ?? "-"}
                    {row.requestedDeliveryDateLabel && (
                      <>
                        {" "}
                        · Entrega: {row.requestedDeliveryDateLabel}
                        {row.requestedDeliveryTime && ` ${row.requestedDeliveryTime}`}
                      </>
                    )}
                    {row.deliveryFee > 0 && <> · Envio: {formatMoney(row.deliveryFee)}</>}
                  </p>
                ) : (
                  row.requestedDeliveryDateLabel && (
                    <p className="mt-1 text-sm text-neutral-500">
                      🏬 Recoger: {row.requestedDeliveryDateLabel}
                      {row.requestedDeliveryTime && ` ${row.requestedDeliveryTime}`}
                    </p>
                  )
                )}
              </div>
              <p className="text-lg font-semibold text-neutral-900">{formatMoney(row.total)}</p>
            </div>

            <ul className="mt-3 space-y-1 text-sm text-neutral-600">
              {row.items.map((item, index) => (
                <li key={index} className="flex justify-between">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span>{formatMoney(item.quantity * item.unitPrice)}</span>
                </li>
              ))}
            </ul>

            {row.packagingNotes && (
              <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-2.5">
                <p className="text-xs font-medium text-sky-800">📦 Paquetes:</p>
                <p className="whitespace-pre-line text-sm text-sky-900">{row.packagingNotes}</p>
              </div>
            )}

            {row.comment && (
              <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
                <p className="text-xs font-medium text-neutral-600">💬 Comentario:</p>
                <p className="whitespace-pre-line text-sm text-neutral-700">{row.comment}</p>
              </div>
            )}

            {row.status === "pending" && (
              <div className="mt-3 flex items-center gap-3 border-t border-neutral-100 pt-3">
                {!row.confirmed &&
                  (buildWhatsAppConfirmHref(row) ? (
                    <a
                      href={buildWhatsAppConfirmHref(row)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => confirmStoreOrder(row.id)}
                      className="rounded-md border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50"
                    >
                      Confirmar pedido (WhatsApp)
                    </a>
                  ) : (
                    <span
                      title="Este pedido no tiene telefono guardado."
                      className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-400"
                    >
                      Confirmar pedido (WhatsApp)
                    </span>
                  ))}
                <button
                  type="button"
                  onClick={() => markStoreOrderFulfilled(row.id)}
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Marcar como atendido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("¿Cancelar este pedido?")) cancelStoreOrder(row.id);
                  }}
                  className="text-sm text-neutral-500 hover:text-red-600"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end border-t border-neutral-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `¿Eliminar el pedido ${row.folioLabel}? Esta accion no se puede deshacer y borra el pedido por completo (no solo lo cancela).`,
                    )
                  ) {
                    deleteStoreOrder(row.id);
                  }
                }}
                className="text-sm text-neutral-400 hover:text-red-600"
              >
                Eliminar pedido
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
