"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRequisicionNote } from "../actions";

/**
 * Nota de la requisicion, editable despues de registrarla.
 *
 * Es el unico campo que se puede cambiar: las cantidades y los costos quedan congelados al
 * enviar, y corregirlos significaria mover inventario que ya se movio. Si algo salio mal en
 * los renglones, la requisicion se borra y se vuelve a hacer.
 */
export default function RequisicionNota({
  requisicionId,
  notaInicial,
}: {
  requisicionId: string;
  notaInicial: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(notaInicial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, startGuardado] = useTransition();

  function guardar() {
    setError(null);
    startGuardado(async () => {
      const resultado = await updateRequisicionNote(requisicionId, texto);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando) {
    return (
      <div className="flex items-start gap-2">
        <p className={`text-sm ${notaInicial ? "text-neutral-600" : "text-neutral-400"}`}>
          {notaInicial || "Sin notas"}
        </p>
        <button
          type="button"
          onClick={() => {
            setTexto(notaInicial ?? "");
            setEditando(true);
          }}
          className="text-xs font-medium text-neutral-400 underline-offset-2 transition-colors hover:text-neutral-700 hover:underline"
        >
          {notaInicial ? "Editar" : "Agregar nota"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={1000}
        autoFocus
        placeholder="Por ejemplo: se mando incompleto, falto la caja de aceite."
        className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditando(false);
            setError(null);
          }}
          disabled={guardando}
          className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
