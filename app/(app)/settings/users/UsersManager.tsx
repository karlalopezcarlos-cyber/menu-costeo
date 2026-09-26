"use client";

import { useState } from "react";
import UserForm, { type EditableUser } from "./UserForm";
import { toggleUserActive } from "./actions";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "STAFF";
  isActive: boolean;
  allowedPanels: Panel[];
  sucursalIds: string[];
  sucursalNames: string[];
};

const PANEL_LABELS = new Map(PANEL_DEFS.map((p) => [p.key, p.label]));

export default function UsersManager({
  users,
  sucursales,
}: {
  users: UserRow[];
  sucursales: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<EditableUser | null>(null);

  return (
    <div className="space-y-6">
      <UserForm
        key={editing?.id ?? "new"}
        editing={editing}
        sucursales={sucursales}
        onCancelEdit={() => setEditing(null)}
      />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Nombre</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Correo</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Rol</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Sucursal</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Paneles</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Estado</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">{u.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-500">{u.email}</td>
                <td className="px-4 py-3 text-neutral-500">{u.role === "OWNER" ? "Dueno" : "Staff"}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {u.role === "OWNER" ? "Todas" : u.sucursalNames.length > 0 ? u.sucursalNames.join(", ") : "-"}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {u.role === "OWNER"
                    ? "Todos"
                    : u.allowedPanels.length === 0
                      ? "Ninguno (solo Panel)"
                      : u.allowedPanels.map((p) => PANEL_LABELS.get(p) ?? p).join(", ")}
                </td>
                <td className="px-4 py-3">
                  <span className={u.isActive ? "text-green-700" : "text-neutral-400"}>
                    {u.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.role !== "OWNER" && (
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            id: u.id,
                            email: u.email,
                            name: u.name,
                            allowedPanels: u.allowedPanels,
                            sucursalIds: u.sucursalIds,
                          })
                        }
                        className="text-neutral-400 hover:text-neutral-900"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleUserActive(u.id, !u.isActive)}
                        className="text-neutral-400 hover:text-red-600"
                      >
                        {u.isActive ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
