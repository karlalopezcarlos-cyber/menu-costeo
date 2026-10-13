"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deletePortion } from "./actions";

export default function PortionRowActions({ recipeId, name }: { recipeId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function borrar() {
    const ok = window.confirm(
      `Borrar la porcion "${name}"?\n\nSi ya la usaste en algun porcionamiento, no se borra: se archiva para no romper el historial.`,
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deletePortion(recipeId);
      if (result.error) {
        setMensaje(result.error);
        return;
      }
      if (result.archived) {
        setMensaje("Ya tenia historial, asi que se archivo en vez de borrarse.");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {mensaje && <span className="text-xs text-amber-600">{mensaje}</span>}
      <Link
        href={`/portioning/portions/${recipeId}/edit`}
        className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
      >
        Editar
      </Link>
      <button
        type="button"
        onClick={borrar}
        disabled={pending}
        className="text-sm font-medium text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
      >
        {pending ? "..." : "Borrar"}
      </button>
    </div>
  );
}
