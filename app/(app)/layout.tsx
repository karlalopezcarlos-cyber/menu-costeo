import { requireOrgSession } from "@/lib/tenant";
import { signOut } from "@/lib/auth";
import NavLinks from "./NavLinks";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Panel" },
  { href: "/products", label: "Productos" },
  { href: "/purchases", label: "Compras" },
  { href: "/waste", label: "Mermas" },
  { href: "/recipes", label: "Recetas" },
  { href: "/production", label: "Produccion" },
  { href: "/inventory", label: "Inventario" },
  { href: "/audit", label: "Auditoria" },
  { href: "/orders", label: "Pedidos" },
  { href: "/sales", label: "Ventas" },
  { href: "/menu-engineering", label: "Ingenieria de menu" },
  { href: "/settings/categories", label: "Configuracion" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrgSession();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <NavLinks items={NAV_ITEMS} />
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
      </header>
      <main className="mx-auto max-w-[1600px] px-6 py-6">{children}</main>
    </div>
  );
}
