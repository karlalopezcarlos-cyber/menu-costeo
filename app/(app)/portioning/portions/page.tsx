import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost } from "@/lib/costing";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";

export default async function PortionsPage() {
  const user = await requireSucursalContext();

  const [recipes, graph] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, isPortion: true, archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { product: { select: { name: true, baseUnit: true } } },
        },
      },
    }),
    loadOrgRecipeGraph(user.sucursalId),
  ]);

  const rows = recipes.map((recipe) => {
    let costo: number | null = null;
    try {
      costo = Number(getRecipeCost(recipe.id, graph));
    } catch {
      costo = null; // receta con datos inconsistentes: se muestra sin costo en vez de tronar
    }
    const [principal, ...extras] = recipe.items;
    return {
      id: recipe.id,
      name: recipe.name,
      principal: principal
        ? `${Number(principal.quantity)} ${UNIT_LABELS[principal.unit as UnitValue]} de ${principal.product?.name ?? "?"}`
        : "Sin ingrediente principal",
      extras: extras.map(
        (e) => `${Number(e.quantity)} ${UNIT_LABELS[e.unit as UnitValue]} de ${e.product?.name ?? "subreceta"}`,
      ),
      costo,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Porcionamiento</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Porciones</h1>
          <p className="mt-1 text-sm text-neutral-500">
            El catalogo de porciones: que lleva cada una y cuanto cuesta hoy.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Ver porcionamientos
          </Link>
          <Link
            href="/portioning/portions/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Nueva porcion
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Porcion</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Lleva</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Mas</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-right">Costo por pieza</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Todavia no hay porciones. Crea la primera para poder registrar porcionamientos.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  <Link href={`/recipes/${row.id}`} className="transition-colors hover:text-brand-600">
                    {row.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">{row.principal}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {row.extras.length === 0 ? <span className="text-neutral-400">—</span> : row.extras.join(" · ")}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">
                  {row.costo === null ? <span className="text-neutral-400">—</span> : formatMoney(row.costo, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
