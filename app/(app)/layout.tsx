import { cookies } from "next/headers";
import { requireOrgSession } from "@/lib/tenant";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PANEL_DEFS, hasPanelAccess } from "@/lib/permissions";
import Sidebar from "./Sidebar";
import SucursalSwitcher from "./_components/SucursalSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrgSession();

  const navItems = PANEL_DEFS.filter((p) => hasPanelAccess(user.role, user.allowedPanels, p.key)).map(
    (p) => ({ href: p.href, label: p.label }),
  );

  // El selector de sucursal aparece si hay mas de una opcion para elegir: para OWNER/SUPERADMIN
  // son todas las de la organizacion; para STAFF, solo las que tiene asignadas (user.sucursalIds).
  let sucursalSwitcher: React.ReactNode = null;
  const isOwnerLike = user.role !== "STAFF";
  const sucursales = await prisma.sucursal.findMany({
    where: isOwnerLike
      ? { organizationId: user.organizationId, isActive: true }
      : { id: { in: user.sucursalIds }, isActive: true },
    orderBy: [{ isCentral: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  if (sucursales.length > 1) {
    const cookieStore = await cookies();
    const activeId = cookieStore.get("activeSucursalId")?.value;
    const activeExists = sucursales.some((s) => s.id === activeId);
    sucursalSwitcher = (
      <SucursalSwitcher sucursales={sucursales} activeId={activeExists ? activeId! : sucursales[0].id} />
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar items={navItems} />
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-end gap-4 px-6">
            {sucursalSwitcher}
            <div className="hidden h-5 w-px bg-neutral-200 sm:block" />
            <form
              className="flex items-center gap-3"
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <span className="hidden text-sm text-neutral-500 sm:inline">{user.email}</span>
              <button
                type="submit"
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
              >
                Salir
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
