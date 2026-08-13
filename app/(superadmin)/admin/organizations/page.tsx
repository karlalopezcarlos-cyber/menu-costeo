import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { toggleOrganizationActive } from "./actions";
import DeleteOrganizationButton from "./DeleteOrganizationButton";

export default async function OrganizationsPage() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, products: true, recipes: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Restaurantes (clientes)</h1>
        <Link
          href="/admin/organizations/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Dar de alta cliente
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Usuarios</th>
              <th className="px-4 py-2 font-medium">Productos</th>
              <th className="px-4 py-2 font-medium">Recetas</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => (
              <tr key={org.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/organizations/${org.id}`} className="text-neutral-900 hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">{org._count.users}</td>
                <td className="px-4 py-2 text-neutral-500">{org._count.products}</td>
                <td className="px-4 py-2 text-neutral-500">{org._count.recipes}</td>
                <td className="px-4 py-2">
                  {org.isActive ? (
                    <span className="text-green-700">Activo</span>
                  ) : (
                    <span className="text-neutral-400">Desactivado</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <form
                      action={async () => {
                        "use server";
                        await toggleOrganizationActive(org.id, !org.isActive);
                      }}
                    >
                      <button type="submit" className="text-neutral-400 hover:text-neutral-900">
                        {org.isActive ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                    <DeleteOrganizationButton organizationId={org.id} organizationName={org.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
