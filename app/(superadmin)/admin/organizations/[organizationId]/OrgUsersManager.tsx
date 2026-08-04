"use client";

import { Fragment, useState } from "react";
import OrgUserForm from "./OrgUserForm";
import { toggleOrgUserActive } from "./actions";
import { PANEL_DEFS } from "@/lib/permissions";
import type { Panel } from "@/generated/prisma/client";

export type OrgUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "OWNER" | "STAFF";
  isActive: boolean;
  allowedPanels: Panel[];
  sucursalId: string | null;
  sucursalName: string | null;
};

const PANEL_LABELS = new Map(PANEL_DEFS.map((p) => [p.key, p.label]));

export default function OrgUsersManager({
  organizationId,
  users,
  sucursales,
}: {
  organizationId: string;
  users: OrgUserRow[];
  sucursales: { id: string; name: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Correo</th>
            <th className="px-4 py-2 font-medium">Rol</th>
            <th className="px-4 py-2 font-medium">Sucursal</th>
            <th className="px-4 py-2 font-medium">Paneles</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <Fragment key={u.id}>
              <tr className="border-t border-neutral-100">
                <td className="px-4 py-2">{u.name ?? "-"}</td>
                <td className="px-4 py-2 text-neutral-500">{u.email}</td>
                <td className="px-4 py-2 text-neutral-500">{u.role === "OWNER" ? "Dueno" : "Staff"}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {u.role === "OWNER" ? "Todas" : (u.sucursalName ?? "-")}
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {u.role === "OWNER"
                    ? "Todos"
                    : u.allowedPanels.length === 0
                      ? "Ninguno (solo Panel)"
                      : u.allowedPanels.map((p) => PANEL_LABELS.get(p) ?? p).join(", ")}
                </td>
                <td className="px-4 py-2">
                  <span className={u.isActive ? "text-green-700" : "text-neutral-400"}>
                    {u.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                      className="text-neutral-400 hover:text-neutral-900"
                    >
                      {editingId === u.id ? "Cerrar" : "Editar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleOrgUserActive(organizationId, u.id, !u.isActive)}
                      className="text-neutral-400 hover:text-red-600"
                    >
                      {u.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
              {editingId === u.id && (
                <tr className="border-t border-neutral-100">
                  <td colSpan={7} className="px-4 py-3">
                    <OrgUserForm
                      organizationId={organizationId}
                      user={u}
                      sucursales={sucursales}
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
