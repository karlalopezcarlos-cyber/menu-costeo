import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import SettingsNav from "../SettingsNav";
import SucursalesManager, { type SucursalRow } from "./SucursalesManager";

export default async function SucursalesPage() {
  const user = await requireOrgSession();

  const sucursales = await prisma.sucursal.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ isCentral: "desc" }, { name: "asc" }],
    include: { _count: { select: { userAccess: true } } },
  });

  const rows: SucursalRow[] = sucursales.map((s) => ({
    id: s.id,
    name: s.name,
    isCentral: s.isCentral,
    isActive: s.isActive,
    userCount: s._count.userAccess,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/sucursales" />
        <p className="mt-3 text-sm text-neutral-500">
          Cada sucursal tiene sus propias compras, ventas, recetas e inventario. La sucursal marcada
          como CEDIS es la principal de tu organizacion.
        </p>
      </div>

      {user.role !== "OWNER" ? (
        <p className="text-sm text-neutral-500">Solo el dueno de la cuenta puede administrar sucursales.</p>
      ) : (
        <SucursalesManager sucursales={rows} />
      )}
    </div>
  );
}
