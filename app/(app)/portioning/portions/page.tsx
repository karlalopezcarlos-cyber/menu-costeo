import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";
import PortionRowActions from "./PortionRowActions";

export default async function PortionsPage() {
  const user = await requireOrgSession();

  // Una porcion es un producto con peso por porcion capturado. Eso es lo unico que la distingue
  // de cualquier otro producto de proceso.
  const portions = await prisma.product.findMany({
    where: { organizationId: user.organizationId, archivedAt: null, portionQty: { not: null } },
    orderBy: { name: "asc" },
    include: {
      extrasRecipe: { select: { name: true } },
      category: { select: { name: true } },
      defaultSourceProduct: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Porciones</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Cada porcion es un producto de tu catalogo. Su costo lo pone la transformacion del
            dia: lo que entro entre las piezas que de verdad salieron. Los productos que salen de
            limpiar (POLLO LIMPIO) se dan de alta como producto de proceso y luego se eligen aqui.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Transformaciones
          </Link>
          <Link
            href="/products/new"
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            title="Para los productos que salen de limpiar, como POLLO LIMPIO: marca &quot;se obtiene por proceso&quot;"
          >
            Nuevo producto de proceso
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
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Sale de</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Lleva</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Agregados</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Costo vigente
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {portions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Todavia no hay porciones. Crea una (ej. CAMARON 20 G) y despues registra la
                  transformacion que las produce.
                </td>
              </tr>
            )}
            {portions.map((portion) => (
              <tr key={portion.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/portioning/portions/${portion.id}/edit`}
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    {portion.name}
                  </Link>
                  {portion.category && (
                    <p className="text-xs text-neutral-500">{portion.category.name}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {portion.defaultSourceProduct?.name ?? (
                    <span className="text-neutral-400">se elige al porcionar</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {Number(portion.portionQty).toLocaleString("es-MX", { maximumFractionDigits: 4 })}{" "}
                  {portion.portionUnit ? UNIT_LABELS[portion.portionUnit as UnitValue] : ""}
                </td>
                <td className="px-4 py-3 text-neutral-500">{portion.extrasRecipe?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {portion.currentUnitCostUpdatedAt ? (
                    <span className="font-medium text-neutral-900">
                      {formatMoney(Number(portion.currentUnitCost), 2)}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">sin transformaciones</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <PortionRowActions productId={portion.id} name={portion.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
