import { cookies } from "next/headers";
import { requireOrgSession } from "@/lib/tenant";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PANEL_DEFS, hasPanelAccess } from "@/lib/permissions";
import NavLinks from "./NavLinks";
import SucursalSwitcher from "./_components/SucursalSwitcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrgSession();

  const navItems = PANEL_DEFS.filter((p) => hasPanelAccess(user.role, user.allowedPanels, p.key)).map(
    (p) => ({ href: p.href, label: p.label }),
  );

  // El selector de sucursal solo aplica a OWNER/SUPERADMIN (sucursalId null): un STAFF tiene su
  // sucursal fija y no necesita cambiar de contexto.
  let sucursalSwitcher: React.ReactNode = null;
  if (user.sucursalId === null) {
    const sucursales = await prisma.sucursal.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: [{ isCentral: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    if (sucursales.length > 1) {
      const cookieStore = await cookies();
      const activeId = cookieStore.get("activeSucursalId")?.value;
      const activeExists = sucursales.some((s) => s.id === activeId);
      sucursalSwitcher = (
        <SucursalSwitcher
          sucursales={sucursales}
          activeId={activeExists ? activeId! : sucursales[0].id}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <NavLinks items={navItems} />
          <div className="flex items-center gap-4">
            {sucursalSwitcher}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <span className="mr-3 text-sm text-neutral-500">{user.email}</span>
              <button type="submit" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
    </div>
  );
}
