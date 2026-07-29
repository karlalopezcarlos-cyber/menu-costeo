"use client";

import { useActionState } from "react";
import Link from "next/link";
import { sendOrderEmail } from "./actions";

const initialState: { error?: string; success?: boolean } = {};

export default function OrderSendActions({
  orderId,
  supplierPhone,
  supplierEmail,
  whatsappMessage,
}: {
  orderId: string;
  supplierPhone: string | null;
  supplierEmail: string | null;
  whatsappMessage: string;
}) {
  const boundSendEmail = sendOrderEmail.bind(null, orderId);
  const [state, formAction, pending] = useActionState(boundSendEmail, initialState);

  const digitsOnly = supplierPhone ? supplierPhone.replace(/\D/g, "") : "";
  const whatsappHref = digitsOnly
    ? `https://wa.me/${digitsOnly}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return (
    <>
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Enviar por WhatsApp
        </a>
      ) : (
        <span
          title="Agrega el WhatsApp del proveedor en Configuracion > Proveedores"
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-400"
        >
          Enviar por WhatsApp
        </span>
      )}

      {supplierEmail ? (
        <form action={formAction} className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {pending ? "Enviando..." : "Enviar por correo"}
          </button>
          {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
          {state?.success && <span className="text-xs text-emerald-700">Enviado a {supplierEmail}</span>}
        </form>
      ) : (
        <span
          title="Agrega el correo del proveedor en Configuracion > Proveedores"
          className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-400"
        >
          Enviar por correo
        </span>
      )}

      {(!whatsappHref || !supplierEmail) && (
        <Link href="/settings/suppliers" className="text-xs text-neutral-500 hover:underline">
          Configurar contacto del proveedor
        </Link>
      )}
    </>
  );
}
