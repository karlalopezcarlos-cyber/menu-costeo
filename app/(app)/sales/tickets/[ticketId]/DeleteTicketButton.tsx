"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSaleTicket } from "../../actions";

export default function DeleteTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Eliminar este ticket? Esta accion no se puede deshacer.")) return;
    setPending(true);
    try {
      await deleteSaleTicket(ticketId);
      router.push("/sales/tickets");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Eliminando..." : "Eliminar ticket"}
    </button>
  );
}
