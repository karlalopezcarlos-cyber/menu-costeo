"use server";

import { cookies } from "next/headers";

/** Sucursal activa para un OWNER/SUPERADMIN mientras navega la app (no aplica a STAFF, que tiene sucursal fija). */
export async function setActiveSucursal(sucursalId: string) {
  const store = await cookies();
  store.set("activeSucursalId", sucursalId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
