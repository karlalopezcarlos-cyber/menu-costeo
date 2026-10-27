"use client";

import { useTransition } from "react";

export default function CategoryGroupSelect({
  categoryId,
  initialGroup,
  groups,
  action,
}: {
  categoryId: string;
  initialGroup: string | null;
  /** Grupos de costo de la organizacion, en su orden. */
  groups: { id: string; name: string }[];
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
      className="rounded-md border border-neutral-200 px-2 py-1 text-sm disabled:opacity-50"
    >
      <option value="">Sin grupo</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </select>
  );
}
