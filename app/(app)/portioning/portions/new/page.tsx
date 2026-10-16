import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import PortionForm from "../PortionForm";
import { createPortion } from "../actions";

export default async function NewPortionPage() {
  const user = await requireSucursalContext();

  const [categories, recipes, sourceProducts] = await Promise.all([
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

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Nueva porcion</h1>
        <Link href="/portioning/portions" className="text-sm text-neutral-500 hover:underline">
          Volver
        </Link>
      </div>
      <PortionForm
        action={createPortion}
        categories={categories}
        recipes={recipes}
        sourceProducts={sourceProducts}
        submitLabel="Crear porcion"
      />
    </div>
  );
}
