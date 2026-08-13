import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import NewSupplierForm from "./NewSupplierForm";
import SupplierRow from "./SupplierRow";
import SettingsNav from "../SettingsNav";

export default async function SuppliersPage() {
  const user = await requireOrgSession();

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { purchases: true } } },
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
          <SettingsNav active="/settings/suppliers" />
          <p className="mt-3 text-sm text-neutral-500">
            Estos proveedores aparecen como lista desplegable al registrar una compra o un pedido
            (los inactivos dejan de aparecer ahi, pero su historial no se toca). El WhatsApp y
            correo principales se usan para enviarles un pedido directamente desde Pedidos.
          </p>
        </div>
        <a
          href="/api/export/suppliers"
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>

      <NewSupplierForm />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Compras</th>
              <th className="px-4 py-2 font-medium">Contacto principal</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay proveedores.
                </td>
              </tr>
            )}
            {suppliers.map((supplier) => (
              <SupplierRow
                key={supplier.id}
                supplier={{
                  id: supplier.id,
                  name: supplier.name,
                  phone: supplier.phone,
                  email: supplier.email,
                  isActive: supplier.isActive,
                  purchaseCount: supplier._count.purchases,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
