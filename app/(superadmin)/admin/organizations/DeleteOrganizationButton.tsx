"use client";

import { useState, useTransition } from "react";
import { deleteOrganization } from "./actions";

export default function DeleteOrganizationButton({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const typed = prompt(
      `Esto borra PERMANENTEMENTE "${organizationName}" y todos sus datos (usuarios, sucursales, catalogo, todo lo capturado). No se puede deshacer.\n\nPara confirmar, escribe el nombre exacto del cliente:`,
    );
    if (typed === null) return;
    if (typed.trim() !== organizationName) {
      setError("El nombre no coincide. No se borro nada.");
      return;
    }
    startTransition(async () => {
      try {
        await deleteOrganization(organizationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo borrar el cliente.");
      }
    });
  }

  return (
    <div className="inline-block text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "Borrando..." : "Eliminar"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
