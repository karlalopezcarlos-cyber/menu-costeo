"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function MoveGroupButtons({
  costGroupId,
  isFirst,
  isLast,
  action,
}: {
  costGroupId: string;
  isFirst: boolean;
  isLast: boolean;
  action: (costGroupId: string, direction: "up" | "down") => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function mover(direction: "up" | "down") {
    startTransition(async () => {
      await action(costGroupId, direction);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending || isFirst}
        onClick={() => mover("up")}
        className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-600 disabled:opacity-30"
        title="Mover a la izquierda en el reporte"
      >
        ▲
      </button>
      <button
        type="button"
        disabled={pending || isLast}
        onClick={() => mover("down")}
        className="rounded border border-neutral-200 px-1.5 text-xs text-neutral-600 disabled:opacity-30"
        title="Mover a la derecha en el reporte"
      >
        ▼
      </button>
    </div>
  );
}
