import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import NewProductForm from "./NewProductForm";

export default async function NewProductPage() {
  const user = await requireOrgSession();
  const categories = await prisma.productCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nuevo producto</h1>
      <NewProductForm categories={categories} />
    </div>
  );
}
