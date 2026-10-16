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

  const [portion, categories, recipes] = await Promise.all([
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
        }}
        categories={categories}
        recipes={recipes}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
