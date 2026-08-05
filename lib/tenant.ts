import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";

/** Exige una sesion con organizacion (OWNER o STAFF); redirige a /login si no hay sesion valida. */
export async function requireOrgSession() {
  const session = await auth();
  if (!session?.user || !session.user.organizationId) {
    redirect("/login");
  }
  return session.user as typeof session.user & { organizationId: string };
}

/**
 * Sucursal activa para leer/escribir datos operativos. STAFF siempre usa su sucursal fija
 * (user.sucursalId). OWNER/SUPERADMIN (sucursalId null) usan la cookie "activeSucursalId" que
 * pone el selector del layout; si no hay cookie o apunta a una sucursal que ya no existe/esta
 * inactiva, se cae a la sucursal central de la organizacion.
 */
export async function requireSucursalContext() {
  const user = await requireOrgSession();

  if (user.sucursalId) {
    return { ...user, sucursalId: user.sucursalId };
  }

  const cookieStore = await cookies();
  const activeId = cookieStore.get("activeSucursalId")?.value;

  if (activeId) {
    const active = await prisma.sucursal.findFirst({
      where: { id: activeId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (active) return { ...user, sucursalId: active.id };
  }

  const central = await prisma.sucursal.findFirst({
    where: { organizationId: user.organizationId, isCentral: true },
    select: { id: true },
  });
  if (!central) throw new Error("La organizacion no tiene una sucursal central configurada.");

  return { ...user, sucursalId: central.id };
}

/** Exige una sesion con uno de los roles indicados; redirige a /login si no cumple. */
export async function requireRole(roles: Role[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) {
    redirect("/login");
  }
  return session.user;
}
