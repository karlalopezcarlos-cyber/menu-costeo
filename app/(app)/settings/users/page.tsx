import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import SettingsNav from "../SettingsNav";
import OrgNameForm from "./OrgNameForm";
import UsersManager, { type UserRow } from "./UsersManager";

export default async function UsersPage() {
  const user = await requireOrgSession();

  const [organization, users, sucursales] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      include: { sucursal: { select: { name: true } } },
    }),
    prisma.sucursal.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: [{ isCentral: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  if (!organization) return null;

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "OWNER" ? "OWNER" : "STAFF",
    isActive: u.isActive,
    allowedPanels: u.allowedPanels,
    sucursalId: u.sucursalId,
    sucursalName: u.sucursal?.name ?? null,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/users" />
        <p className="mt-3 text-sm text-neutral-500">
          Cambia el nombre de tu negocio y administra quien puede entrar a tu cuenta y que paneles
          puede ver cada quien.
        </p>
      </div>

      {user.role !== "OWNER" ? (
        <p className="text-sm text-neutral-500">
          Solo el dueno de la cuenta puede administrar el nombre del negocio y los usuarios.
        </p>
      ) : (
        <>
          <OrgNameForm name={organization.name} />
          <UsersManager users={rows} sucursales={sucursales} />
        </>
      )}
    </div>
  );
}
