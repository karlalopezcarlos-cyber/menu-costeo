"use client";

import { useState } from "react";
import { generateSaleTicketPaymentLink } from "../../actions";

export default function PaymentLinkActions({
  ticketId,
  folioLabel,
  totalLabel,
  initialPaymentLink,
}: {
  ticketId: string;
  folioLabel: string;
  totalLabel: string;
  initialPaymentLink: string | null;
}) {
  const [paymentLink, setPaymentLink] = useState(initialPaymentLink);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    const result = await generateSaleTicketPaymentLink(ticketId);
    if (result.error) {
      setError(result.error);
    } else if (result.paymentLink) {
      setPaymentLink(result.paymentLink);
    }
    setPending(false);
  }

  const whatsappMessage = paymentLink
    ? `Hola, aqui esta tu link de pago del ticket ${folioLabel} por ${totalLabel}:\n${paymentLink}`
    : "";
  const whatsappHref = paymentLink
    ? `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        {pending ? "Generando..." : paymentLink ? "Regenerar link de pago" : "Generar link de pago"}
      </button>

      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Enviar por WhatsApp
        </a>
      )}

      {error && <span className="text-sm text-red-600">{error}</span>}
      {paymentLink && !error && (
        <a
          href={paymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-neutral-500 hover:underline"
        >
          Ver link de pago
        </a>
      )}
    </div>
  );
}
