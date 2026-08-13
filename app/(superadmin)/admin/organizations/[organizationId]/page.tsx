import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenant";
import OrgUsersManager, { type OrgUserRow } from "./OrgUsersManager";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireRole(["SUPERADMIN"]);
  const { organizationId } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      users: {
        orderBy: [{ role: "asc" }, { email: "asc" }],
        include: { sucursales: { include: { sucursal: { select: { id: true, name: true } } } } },
      },
      sucursales: { where: { isActive: true }, orderBy: [{ isCentral: "desc" }, { name: "asc" }] },
    },
  });
  if (!organization) notFound();

  const rows: OrgUserRow[] = organization.users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "OWNER" ? "OWNER" : "STAFF",
    isActive: u.isActive,
    allowedPanels: u.allowedPanels,
    sucursalIds: u.sucursales.map((s) => s.sucursal.id),
    sucursalNames: u.sucursales.map((s) => s.sucursal.name),
  }));
  const sucursales = organization.sucursales.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/organizations" className="text-sm text-neutral-500 hover:underline">
          ← Restaurantes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{organization.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Correo y contrasena de los usuarios de este cliente. La contrasena no se puede ver una vez
          guardada, pero puedes asignar una nueva.
        </p>
      </div>

      <OrgUsersManager organizationId={organization.id} users={rows} sucursales={sucursales} />
    </div>
  );
}
