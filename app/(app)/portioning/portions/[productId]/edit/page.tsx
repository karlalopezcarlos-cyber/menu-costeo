import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import type { UnitValue } from "@/lib/units";
import PortionForm from "../../PortionForm";
import { updatePortion } from "../../actions";

export default async function EditPortionPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const user = await requireSucursalContext();

  const [portion, categories, recipes, sourceProducts] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, organizationId: user.organizationId } }),
    prisma.productCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Lo que puede ser origen de una porcion: cualquier producto que no sea otra porcion.
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null, portionQty: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isProcessed: true },
    }),
  ]);
  if (!portion) notFound();

  const updateWithId = updatePortion.bind(null, portion.id);

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Editar porcion</h1>
        <Link href="/portioning/portions" className="text-sm text-neutral-500 hover:underline">
          Volver
        </Link>
      </div>
      <PortionForm
        action={updateWithId}
        values={{
          name: portion.name,
          portionQty: portion.portionQty ? portion.portionQty.toString() : "",
          portionUnit: (portion.portionUnit ?? "G") as UnitValue,
          extrasRecipeId: portion.extrasRecipeId,
          categoryId: portion.categoryId,
          defaultSourceProductId: portion.defaultSourceProductId,
        }}
        categories={categories}
        recipes={recipes}
        sourceProducts={sourceProducts.filter((p) => p.id !== portion.id)}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
