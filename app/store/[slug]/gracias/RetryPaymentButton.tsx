"use client";

import { useState } from "react";
import { retryStoreOrderPayment } from "../../actions";

export default function RetryPaymentButton({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await retryStoreOrderPayment(orderId, window.location.origin);
    if (result.paymentLink) {
      window.location.href = result.paymentLink;
      return;
    }
    setError(result.error ?? "No se pudo generar el link de pago.");
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Generando..." : "Intentar nuevamente"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
