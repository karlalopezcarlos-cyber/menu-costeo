import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import NewSupplierForm from "./NewSupplierForm";
import SupplierRow from "./SupplierRow";

export default async function SuppliersPage() {
  const user = await requireOrgSession();

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { purchases: true } } },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <nav className="mt-3 flex gap-4 border-b border-neutral-200 text-sm">
          <Link href="/settings/categories" className="pb-2 text-neutral-500 hover:text-neutral-900">
            Categorias de productos
          </Link>
          <Link
            href="/settings/recipe-categories"
            className="pb-2 text-neutral-500 hover:text-neutral-900"
          >
            Categorias de recetas
          </Link>
          <span className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900">
            Proveedores
          </span>
        </nav>
        <p className="mt-3 text-sm text-neutral-500">
          Estos proveedores aparecen como lista desplegable al registrar una compra. Es opcional
          capturarlos; sirven para comparar precios entre proveedores del mismo producto. El
          WhatsApp y correo se usan para enviarles un pedido directamente desde Pedidos.
        </p>
      </div>

      <NewSupplierForm />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Compras</th>
              <th className="px-4 py-2 font-medium">Contacto</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
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
