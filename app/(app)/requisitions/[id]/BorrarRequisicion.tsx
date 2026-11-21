"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRequisicion } from "../actions";

export default function BorrarRequisicion({
  requisicionId,
  folioLabel,
  origen,
  destino,
  renglones,
}: {
  requisicionId: string;
  folioLabel: string;
  origen: string;
  destino: string;
  renglones: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [borrando, startBorrado] = useTransition();

  function borrar() {
    const aviso =
      `Borrar la requisicion ${folioLabel}?\n\n` +
      `Se va a deshacer el movimiento de inventario entre ${origen} y ${destino} ` +
      `(${renglones} renglon${renglones === 1 ? "" : "es"}).\n\nEsto no se puede deshacer.`;
    if (!window.confirm(aviso)) return;

    setError(null);
    startBorrado(async () => {
      const resultado = await deleteRequisicion(requisicionId);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      router.push("/requisitions");
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={borrar}
        disabled={borrando}
        className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        {borrando ? "Borrando..." : "Borrar requisicion"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
