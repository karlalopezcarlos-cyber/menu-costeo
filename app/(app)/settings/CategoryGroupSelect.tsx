"use client";

import { useTransition } from "react";

export default function CategoryGroupSelect({
  categoryId,
  initialGroup,
  action,
}: {
  categoryId: string;
  initialGroup: "ALIMENTO" | "BEBIDAS" | "MISCELANEOS" | null;
  action: (categoryId: string, group: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={initialGroup ?? ""}
      disabled={isPending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => {
          action(categoryId, value);
        });
      }}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="">Sin grupo</option>
      <option value="ALIMENTO">Alimento</option>
      <option value="BEBIDAS">Bebidas</option>
      <option value="MISCELANEOS">Miscelaneos</option>
    </select>
  );
}
