"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archivePortion } from "./actions";

export default function PortionRowActions({ productId, name }: { productId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Quitar "${name}" del catalogo de porciones?`)) return;
        startTransition(async () => {
          await archivePortion(productId);
          router.refresh();
        });
      }}
      className="text-xs text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
    >
      {pending ? "Quitando..." : "Quitar"}
    </button>
  );
}
