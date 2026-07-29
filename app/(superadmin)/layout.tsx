import { requireRole } from "@/lib/tenant";
import { signOut } from "@/lib/auth";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["SUPERADMIN"]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-neutral-900">Panel del consultor</span>
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
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
