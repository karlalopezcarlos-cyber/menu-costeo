import { formatMoney } from "@/lib/format";
import { IVA_RATE } from "@/lib/menu-engineering";
import type { IvaMode } from "@/lib/menu-engineering";

export type DailySalesInput = {
  dateKey: string;
  dateLabel: string;
  quantity: number;
  /** Venta del dia tal como se capturo, es decir con IVA incluido. */
  grossTotal: number;
  dishes: number;
};

/**
 * Venta por dia: lo que entro cada dia, sin desglose de platillos.
 *
 * El precio que se captura es el de menu, o sea con IVA incluido. Por eso "sin IVA" no suma
 * nada: le quita el impuesto a lo capturado (total / 1.16). Es la misma regla que ya usa
 * Ingenieria de menu, para que los dos tableros digan lo mismo.
 */
export default function DailySalesTable({
  days,
  iva,
}: {
  days: DailySalesInput[];
  iva: IvaMode;
}) {
  const factor = iva === "sin" ? 1 / (1 + IVA_RATE) : 1;

  const totalPeriodo = days.reduce((sum, d) => sum + d.grossTotal, 0) * factor;
  const unidades = days.reduce((sum, d) => sum + d.quantity, 0);
  const promedio = days.length > 0 ? totalPeriodo / days.length : 0;
  const mejor = days.reduce<DailySalesInput | null>(
    (mejorDia, d) => (!mejorDia || d.grossTotal > mejorDia.grossTotal ? d : mejorDia),
    null,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Venta del periodo</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
            {formatMoney(totalPeriodo)}
          </p>
          <p className="text-xs text-neutral-500">{iva === "sin" ? "sin IVA" : "con IVA"}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Dias con venta</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{days.length}</p>
          <p className="text-xs text-neutral-500">{unidades.toLocaleString("es-MX")} unidades</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Promedio por dia</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
            {formatMoney(promedio)}
          </p>
          <p className="text-xs text-neutral-500">de los dias que tuvieron venta</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-neutral-500">Mejor dia</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">
            {mejor ? formatMoney(mejor.grossTotal * factor) : "—"}
          </p>
          <p className="text-xs text-neutral-500">{mejor ? mejor.dateLabel : "sin ventas"}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Dia</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Platillos diferentes
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Unidades
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Venta {iva === "sin" ? "sin IVA" : "con IVA"}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-400">
                  No hay ventas en este periodo.
                </td>
              </tr>
            )}
            {days.map((day) => (
              <tr key={day.dateKey} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3 font-medium text-neutral-900">{day.dateLabel}</td>
                <td
                  className="px-4 py-3 text-right tabular-nums text-neutral-500"
                  title={`Ese dia se vendieron ${day.dishes} platillos diferentes del menu`}
                >
                  {day.dishes}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {day.quantity.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">
                  {formatMoney(day.grossTotal * factor)}
                </td>
              </tr>
            ))}
          </tbody>
          {days.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50">
              <tr>
                <td className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Total
                </td>
                <td></td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                  {unidades.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-neutral-900">
                  {formatMoney(totalPeriodo)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        <b>Platillos diferentes</b> es cuantos platillos distintos del menu se vendieron ese dia;
        <b> unidades</b> es cuantos platos salieron en total.
      </p>

      {iva === "sin" && (
        <p className="text-xs text-neutral-500">
          Los precios se capturan como precio de menu, con IVA incluido. &quot;Sin IVA&quot; le
          quita el {Math.round(IVA_RATE * 100)}% a lo capturado (total ÷ {1 + IVA_RATE}).
        </p>
      )}
    </div>
  );
}
