"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Interruptor de "se cuenta en inventario" para una categoria. Guarda al momento, sin boton:
 * es un solo dato y se suele acomodar varias categorias seguidas.
 */
export default function InventoriableToggle({
  categoryId,
  initialValue,
  action,
  label = "Se cuenta",
}: {
  categoryId: string;
  initialValue: boolean;
  action: (categoryId: string, value: boolean) => Promise<void>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input
        type="checkbox"
        defaultChecked={initialValue}
        disabled={pending}
        onChange={(e) => {
          const valor = e.target.checked;
          startTransition(async () => {
            await action(categoryId, valor);
            router.refresh();
          });
        }}
        className="h-4 w-4 rounded border-neutral-300"
      />
      <span className={pending ? "text-neutral-400" : ""}>{label}</span>
    </label>
  );
}
