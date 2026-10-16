import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import { formatMoney } from "@/lib/format";
import ApplyYieldButton from "./ApplyYieldButton";

function folioLabel(folio: number): string {
  return `POR-${String(folio).padStart(4, "0")}`;
}

export default async function PortioningPage() {
  const user = await requireSucursalContext();

  const entries = await prisma.portioningEntry.findMany({
    where: { sucursalId: user.sucursalId },
    orderBy: [{ date: "desc" }, { folio: "desc" }],
    take: 200,
    include: {
      product: { select: { name: true, baseUnit: true } },
      outputProduct: { select: { name: true, baseUnit: true } },
      outputs: {
        include: {
          product: { select: { name: true, baseUnit: true } },
          recipe: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Transformaciones</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Limpiezas y porcionamientos: que entro, que salio y cuanto costo cada pieza. Cada una
            vale por si sola y no mueve el rendimiento del producto que entro.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portioning/portions" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Porciones
          </Link>
          <Link
            href="/portioning/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Nueva transformacion
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Folio</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Fecha</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Entro</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Salio</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Rendimiento
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Todavia no hay transformaciones. Registra una para conocer tu merma real y el
                  costo verdadero de cada porcion.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const unidad = UNIT_LABELS[entry.product.baseUnit as UnitValue];
              const rendimiento = Number(entry.realYieldPct);
              const aplicable = rendimiento > 0 && rendimiento <= 100;
              return (
                <tr key={entry.id} className="border-t border-neutral-100 align-top transition-colors hover:bg-neutral-50">
                  <td className="px-4 py-3 text-neutral-500">{folioLabel(entry.folio)}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {entry.date.toLocaleDateString("es-MX", { timeZone: "UTC" })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{entry.product.name}</p>
                    <p className="text-xs text-neutral-500">
                      {Number(entry.initialQty).toLocaleString("es-MX", { maximumFractionDigits: 3 })} {unidad}
                      {" · "}
                      {formatMoney(Number(entry.initialQty) * Number(entry.unitCost), 2)}
                    </p>
                    {entry.comment && <p className="mt-0.5 text-xs text-neutral-500">{entry.comment}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {entry.outputs.map((output) => {
                      const nombre = output.product?.name ?? output.recipe?.name ?? "—";
                      const cantidad = Number(output.qty ?? output.portions ?? 0);
                      const unidadSalida = output.product
                        ? UNIT_LABELS[output.product.baseUnit as UnitValue]
                        : "";
                      return (
                        <p key={output.id}>
                          {cantidad.toLocaleString("es-MX", { maximumFractionDigits: 3 })}{" "}
                          {unidadSalida && <span className="text-neutral-400">{unidadSalida} </span>}
                          de {nombre}
                          <span className="text-neutral-400">
                            {" · "}
                            {formatMoney(Number(output.realUnitCost), 2)} c/u
                          </span>
                        </p>
                      );
                    })}
                    {/* Limpiezas viejas: su salida vivia en la entrada, no en renglones. */}
                    {entry.outputs.length === 0 && entry.outputProduct && (
                      <p>
                        {Number(entry.outputQty ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 3 })}{" "}
                        {UNIT_LABELS[entry.outputProduct.baseUnit as UnitValue]} de {entry.outputProduct.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        rendimiento > 100
                          ? "font-medium tabular-nums text-amber-600"
                          : rendimiento < 50
                            ? "font-medium tabular-nums text-red-600"
                            : rendimiento < 75
                              ? "font-medium tabular-nums text-amber-600"
                              : "font-medium tabular-nums text-neutral-900"
                      }
                    >
                      {rendimiento.toFixed(2)}%
                    </span>
                    {rendimiento > 100 && (
                      <p className="text-xs text-amber-600">salio mas de lo que entro</p>
                    )}
                    {aplicable && (
                      <div className="mt-1">
                        <ApplyYieldButton
                          entryId={entry.id}
                          productName={entry.product.name}
                          yieldPct={rendimiento}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
