import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { type UnitValue } from "@/lib/units";
import PortionForm, { type ProductOption, type PortionInitial } from "../../new/PortionForm";
import { updatePortion } from "../../actions";

export default async function EditPortionPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const user = await requireSucursalContext();

  const [recipe, products] = await Promise.all([
    prisma.recipe.findFirst({
      where: { id: recipeId, sucursalId: user.sucursalId, isPortion: true },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, baseUnit: true },
    }),
  ]);
  if (!recipe) notFound();

  // El primer renglon es el producto del que sale la porcion; los demas son los extras.
  const conProducto = recipe.items.filter((i) => i.productId);
  const [principal, ...extras] = conProducto;

  const initial: PortionInitial = {
    name: recipe.name,
    parentProductId: principal?.productId ?? "",
    parentQty: principal ? principal.quantity.toString() : "",
    parentUnit: (principal?.unit ?? "G") as UnitValue,
    extras: extras.map((e) => ({
      productId: e.productId!,
      qty: e.quantity.toString(),
      unit: e.unit as UnitValue,
    })),
  };

  const options: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    baseUnit: p.baseUnit as UnitValue,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Porcionamiento</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Editar porcion</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Los porcionamientos ya registrados conservan el costo que tenian: los cambios aplican de aqui en adelante.
          </p>
        </div>
        <Link
          href="/portioning/portions"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver
        </Link>
      </div>

      <PortionForm
        products={options}
        action={updatePortion.bind(null, recipe.id)}
        initial={initial}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
