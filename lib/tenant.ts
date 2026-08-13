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
 * Sucursal activa para leer/escribir datos operativos.
 *
 * OWNER/SUPERADMIN ven/cambian entre TODAS las sucursales de su organizacion (sin importar
 * sucursalIds) usando la cookie "activeSucursalId" que pone el selector del layout; si no hay
 * cookie o apunta a una que ya no existe/esta inactiva, se cae a la sucursal central.
 *
 * STAFF esta restringido a las sucursales listadas en user.sucursalIds (puede tener una o
 * varias). Con una sola, se usa directo sin necesitar cookie. Con varias, usa la misma cookie
 * "activeSucursalId" pero validada contra SU PROPIA lista (nunca contra todas las de la
 * organizacion) para que no pueda acceder a una sucursal ajena manipulando la cookie a mano.
 */
export async function requireSucursalContext() {
  const user = await requireOrgSession();

  if (user.role === "STAFF") {
    if (user.sucursalIds.length === 0) {
      throw new Error("Tu usuario no tiene ninguna sucursal asignada. Contacta al dueno de la cuenta.");
    }

    if (user.sucursalIds.length === 1) {
      return { ...user, sucursalId: user.sucursalIds[0] };
    }

    const cookieStore = await cookies();
    const activeId = cookieStore.get("activeSucursalId")?.value;

    if (activeId && user.sucursalIds.includes(activeId)) {
      const active = await prisma.sucursal.findFirst({
        where: { id: activeId, isActive: true },
        select: { id: true },
      });
      if (active) return { ...user, sucursalId: active.id };
    }

    const fallback = await prisma.sucursal.findFirst({
      where: { id: { in: user.sucursalIds }, isActive: true },
      orderBy: [{ isCentral: "desc" }, { name: "asc" }],
      select: { id: true },
    });
    if (!fallback) throw new Error("Ninguna de tus sucursales asignadas esta activa.");
    return { ...user, sucursalId: fallback.id };
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
