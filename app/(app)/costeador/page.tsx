import Link from "next/link";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { COSTEADOR_INCLUDE, costearPropuesta, nombreDe } from "@/lib/costeador";
import NuevaPropuestaForm from "./NuevaPropuestaForm";

export default async function CosteadorPage() {
  const user = await requireSucursalContext();

  const [propuestas, categorias] = await Promise.all([
    prisma.costeador.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: [{ transferredAt: "asc" }, { updatedAt: "desc" }],
      include: COSTEADOR_INCLUDE,
    }),
    prisma.recipeCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Cada propuesta se recostea al abrir la lista: son pocas por definicion, y un costo viejo en
  // una pantalla que sirve para decidir precios seria peor que no tener la pantalla.
  const filas = await Promise.all(
    propuestas.map(async (p) => ({
      propuesta: p,
      costeo: await costearPropuesta(user.sucursalId, {
        yieldQty: new Decimal(p.yieldQty),
        sellingPrice: p.sellingPrice === null ? null : new Decimal(p.sellingPrice),
        items: p.items,
      }),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Operacion
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Costeador
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Recetas que todavia no existen. Arma el coctel, ponle ingredientes y mira cuanto
            cuesta y cuanto deja antes de meterlo al menu. Nada de esto toca tu catalogo: no sale
            en Recetas, ni en el inventario, ni en la ingenieria de menu, hasta que lo autorices
            y lo transfieras.
          </p>
        </div>
        <NuevaPropuestaForm categorias={categorias} />
      </div>

      {filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="text-sm text-neutral-500">
            Todavia no hay propuestas. Crea una para costear un platillo antes de venderlo.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Propuesta
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Rendimiento
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Costo unitario
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Precio
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Costo %
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ propuesta, costeo }) => (
                <tr key={propuesta.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/costeador/${propuesta.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {propuesta.name}
                    </Link>
                    <p className="text-xs text-neutral-400">
                      {propuesta.category?.name ?? "Sin categoria"} ·{" "}
                      {propuesta.items.length}{" "}
                      {propuesta.items.length === 1 ? "ingrediente" : "ingredientes"} · por{" "}
                      {nombreDe(propuesta.createdBy)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {Number(propuesta.yieldQty).toLocaleString("es-MX", {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {UNIT_LABELS[propuesta.yieldUnit as UnitValue]}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(costeo.costoUnitario)}
                    {costeo.sinCostear > 0 && (
                      <span
                        className="ml-1 text-amber-600"
                        title={`${costeo.sinCostear} ingrediente(s) sin costo`}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                    {costeo.precio === null ? "—" : formatMoney(costeo.precio)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      costeo.costoPct === null
                        ? "text-neutral-400"
                        : costeo.costoPct > 35
                          ? "text-red-600"
                          : "text-emerald-700"
                    }`}
                  >
                    {costeo.costoPct === null ? "—" : `${costeo.costoPct.toFixed(1)}%`}
                  </td>
                  <td className="px-4 py-3">
                    {propuesta.recipe ? (
                      <Link
                        href={`/recipes/${propuesta.recipe.id}`}
                        className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Ya es receta ↗
                      </Link>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                        Propuesta
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
