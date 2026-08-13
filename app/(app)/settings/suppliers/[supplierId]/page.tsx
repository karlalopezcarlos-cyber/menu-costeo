import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import SupplierDetailsForm from "./SupplierDetailsForm";
import SupplierContactsManager from "./SupplierContactsManager";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const user = await requireOrgSession();

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, organizationId: user.organizationId },
    include: {
      phones: { orderBy: { createdAt: "asc" } },
      emails: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!supplier) notFound();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/settings/suppliers" className="text-sm text-neutral-500 hover:underline">
          &larr; Proveedores
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{supplier.name}</h1>
        <p className="text-sm text-neutral-500">
          {supplier.isActive ? "Activo" : "Inactivo"} · Contacto principal: {supplier.phone ?? "-"} /{" "}
          {supplier.email ?? "-"}
        </p>
      </div>

      <SupplierDetailsForm
        supplierId={supplier.id}
        details={{
          rfc: supplier.rfc,
          businessName: supplier.businessName,
          address: supplier.address,
          paymentMethod: supplier.paymentMethod,
          contactName: supplier.contactName,
          bankInfo: supplier.bankInfo,
          creditDays: supplier.creditDays,
          notes: supplier.notes,
        }}
      />

      <SupplierContactsManager supplierId={supplier.id} phones={supplier.phones} emails={supplier.emails} />
    </div>
  );
}
