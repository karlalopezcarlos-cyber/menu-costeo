import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSucursalContext } from "@/lib/tenant";
import { computeItemKardex, type ItemType } from "@/lib/audit";

const TYPE_LABELS: Record<string, string> = {
  compra: "Compra",
  merma: "Merma",
  venta: "Venta",
  produccion_entrada: "Produccion",
  produccion_salida: "Produccion (consumo)",
};

const TYPE_STYLES: Record<string, string> = {
  compra: "bg-emerald-100 text-emerald-700",
  merma: "bg-red-100 text-red-700",
  venta: "bg-blue-100 text-blue-700",
  produccion_entrada: "bg-purple-100 text-purple-700",
  produccion_salida: "bg-amber-100 text-amber-700",
};

function fmt(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
}

function presentationSuffix(
  qty: number,
  presentationUnitQty: number | null,
  presentationUnitLabel: string | null,
): string {
  if (!presentationUnitQty) return "";
  return ` (${(qty / presentationUnitQty).toFixed(2)} ${presentationUnitLabel})`;
}

export default async function ItemKardexPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ initial?: string; final?: string; type?: string }>;
}) {
  const { itemId } = await params;
  const { initial, final, type } = await searchParams;
  const user = await requireSucursalContext();

  if (!initial) notFound();
  const itemType: ItemType = type === "subrecipe" ? "subrecipe" : "product";

  let kardex;
  try {
    kardex = await computeItemKardex(
      user.organizationId,
      user.sucursalId,
      itemType,
      itemId,
      initial,
      final || null,
    );
  } catch {
    notFound();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Kardex - {kardex.itemName}</h1>
        <p className="text-sm text-neutral-500">
          {itemType === "subrecipe" ? "Subreceta" : "Producto"} - {kardex.categoryName ?? "Sin categoria"} -
          Movimientos desde el conteo del {kardex.initialDateLabel}{" "}
          {kardex.finalDateLabel ? `hasta el ${kardex.finalDateLabel}` : "hasta hoy"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Inicial ({kardex.initialDateLabel})</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {fmt(kardex.initialQty)} {kardex.unitLabel}
            {presentationSuffix(kardex.initialQty, kardex.presentationUnitQty, kardex.presentationUnitLabel)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Teorico</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {fmt(kardex.theoreticalFinalQty)} {kardex.unitLabel}
            {presentationSuffix(kardex.theoreticalFinalQty, kardex.presentationUnitQty, kardex.presentationUnitLabel)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">
            Real {kardex.finalDateLabel ? `(${kardex.finalDateLabel})` : ""}
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {kardex.actualFinalQty !== null
              ? `${fmt(kardex.actualFinalQty)} ${kardex.unitLabel}${presentationSuffix(kardex.actualFinalQty, kardex.presentationUnitQty, kardex.presentationUnitLabel)}`
              : "-"}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Variacion</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              kardex.varianceQty === null
                ? "text-neutral-300"
                : Math.abs(kardex.varianceQty) < 0.001
                  ? "text-neutral-500"
                  : kardex.varianceQty < 0
                    ? "text-red-600"
                    : "text-emerald-700"
            }`}
          >
            {kardex.varianceQty !== null
              ? `${kardex.varianceQty > 0 ? "+" : ""}${fmt(kardex.varianceQty)} ${kardex.unitLabel}${presentationSuffix(kardex.varianceQty, kardex.presentationUnitQty, kardex.presentationUnitLabel)}`
              : "-"}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Detalle</th>
              <th className="px-4 py-2 font-medium">Cantidad</th>
              <th className="px-4 py-2 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-neutral-100 bg-neutral-50">
              <td className="px-4 py-2 text-neutral-500">{kardex.initialDateLabel}</td>
              <td className="px-4 py-2">
                <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  Inicial
                </span>
              </td>
              <td className="px-4 py-2 text-neutral-500">Conteo de inventario inicial</td>
              <td className="px-4 py-2">-</td>
              <td className="px-4 py-2 font-medium">
                {fmt(kardex.initialQty)} {kardex.unitLabel}
              </td>
            </tr>
            {kardex.movements.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  No hubo movimientos de este {itemType === "subrecipe" ? "subreceta" : "producto"} en el periodo.
                </td>
              </tr>
            )}
            {kardex.movements.map((m, index) => (
              <tr key={index} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">{m.dateLabel}</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[m.type]}`}>
                    {TYPE_LABELS[m.type]}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {m.href ? (
                    <Link href={m.href} className="hover:underline">
                      {m.label}
                    </Link>
                  ) : (
                    m.label
                  )}
                </td>
                <td className={`px-4 py-2 ${m.qtyDelta < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {m.qtyDelta > 0 ? "+" : ""}
                  {fmt(m.qtyDelta)} {kardex.unitLabel}
                </td>
                <td className="px-4 py-2 font-medium">
                  {fmt(m.runningBalance)} {kardex.unitLabel}
                </td>
              </tr>
            ))}
            {kardex.actualFinalQty !== null && (
              <tr className="border-t border-neutral-200 bg-neutral-50">
                <td className="px-4 py-2 text-neutral-500">{kardex.finalDateLabel}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
                    Conteo real
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-500">Conteo de inventario final (real)</td>
                <td className="px-4 py-2">-</td>
                <td className="px-4 py-2 font-medium">
                  {fmt(kardex.actualFinalQty)} {kardex.unitLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
