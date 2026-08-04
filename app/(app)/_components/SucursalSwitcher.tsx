"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveSucursal } from "../actions";

export default function SucursalSwitcher({
  sucursales,
  activeId,
}: {
  sucursales: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(sucursalId: string) {
    startTransition(async () => {
      await setActiveSucursal(sucursalId);
      router.refresh();
    });
  }

  return (
    <select
      value={activeId}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-700"
    >
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
