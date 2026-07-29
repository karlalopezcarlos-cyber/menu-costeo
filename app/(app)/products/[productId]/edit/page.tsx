import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import type { UnitValue } from "@/lib/units";
import EditProductForm from "./EditProductForm";
import ProductPresentationsManager from "./ProductPresentationsManager";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const user = await requireOrgSession();

  const [product, categories, presentations] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, organizationId: user.organizationId } }),
    prisma.productCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.productPresentation.findMany({
      where: { productId, organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!product) notFound();

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Editar producto</h1>
      <EditProductForm
        product={{
          id: product.id,
          name: product.name,
          categoryId: product.categoryId,
          baseUnit: product.baseUnit as UnitValue,
          yieldPercentage: product.yieldPercentage.toString(),
          presentationUnitLabel: product.presentationUnitLabel,
          presentationUnitQty: product.presentationUnitQty ? product.presentationUnitQty.toString() : null,
        }}
        categories={categories}
      />
      <ProductPresentationsManager
        productId={product.id}
        baseUnit={product.baseUnit as UnitValue}
        presentations={presentations.map((p) => ({
          id: p.id,
          label: p.label,
          quantity: p.quantity.toString(),
          unit: p.unit as UnitValue,
        }))}
      />
    </div>
  );
}
