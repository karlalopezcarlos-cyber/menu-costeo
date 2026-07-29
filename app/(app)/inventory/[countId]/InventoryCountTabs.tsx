"use client";

import { useState, type ReactNode } from "react";

export default function InventoryCountTabs({
  captureTable,
  changeLog,
  changeCount,
}: {
  captureTable: ReactNode;
  changeLog: ReactNode;
  changeCount: number;
}) {
  const [tab, setTab] = useState<"captura" | "bitacora">("captura");

  return (
    <div className="space-y-4">
      <div className="flex gap-4 border-b border-neutral-200 text-sm">
        <button
          type="button"
          onClick={() => setTab("captura")}
          className={`pb-2 ${
            tab === "captura"
              ? "border-b-2 border-neutral-900 font-medium text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          Captura
        </button>
        <button
          type="button"
          onClick={() => setTab("bitacora")}
          className={`pb-2 ${
            tab === "bitacora"
              ? "border-b-2 border-neutral-900 font-medium text-neutral-900"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          Bitacora{changeCount > 0 ? ` (${changeCount})` : ""}
        </button>
      </div>

      <div className={tab === "captura" ? "" : "hidden"}>{captureTable}</div>
      <div className={tab === "bitacora" ? "" : "hidden"}>{changeLog}</div>
    </div>
  );
}
