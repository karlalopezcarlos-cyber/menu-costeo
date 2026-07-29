import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/generated/prisma/client";

/** Exige una sesion con organizacion (OWNER o STAFF); redirige a /login si no hay sesion valida. */
export async function requireOrgSession() {
  const session = await auth();
  if (!session?.user || !session.user.organizationId) {
    redirect("/login");
  }
  return session.user as typeof session.user & { organizationId: string };
}

/** Exige una sesion con uno de los roles indicados; redirige a /login si no cumple. */
export async function requireRole(roles: Role[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) {
    redirect("/login");
  }
  return session.user;
}
