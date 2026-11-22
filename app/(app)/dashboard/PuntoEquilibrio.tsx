import { formatMoney } from "@/lib/format";
import type { PuntoEquilibrio } from "@/lib/income-statement";

const EXPLICACION: Record<NonNullable<PuntoEquilibrio["problema"]>, string> = {
  "sin-ventas":
    "No hay venta capturada en el periodo, y sin venta no hay margen que medir. Sube las ventas y el numero aparece solo.",
  "margen-negativo":
    "Lo que sube con la venta se come la venta completa: cada peso vendido deja menos de cero. No hay volumen que alcance el equilibrio, porque vender mas pierde mas. Lo que hay que mover es el precio o el costo, no la cantidad.",
  "sin-gastos-fijos":
    "No hay un solo gasto fijo capturado en el periodo. El punto de equilibrio daria cero, que no es cierto: lo que falta es registrar la renta, la nomina y los servicios en Gastos, o marcarlos como fijos en Configuracion > Tipos de gasto.",
};

/**
 * Cuanto hay que vender para no perder ni ganar, en el periodo y por dia de operacion.
 *
 * Se pinta siempre, tambien cuando no se puede calcular: un recuadro que desaparece sin decir
 * nada deja pensando que la app no lo tiene. Y el motivo por el que no sale suele ser la
 * informacion mas util de la pantalla, porque casi siempre es algo que falta capturar.
 */
export default function PuntoEquilibrioPanel({ pe }: { pe: PuntoEquilibrio }) {
  if (pe.problema !== null) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
          Punto de equilibrio
        </p>
        <p className="mt-2 text-sm text-neutral-600">{EXPLICACION[pe.problema]}</p>
      </div>
    );
  }

  const alcanzado = pe.faltante! <= 0;
  // La barra se corta en 100: pasado el equilibrio lo que importa es cuanto se gano encima, y
  // eso ya esta en el texto. Una barra que se sale no dice mas.
  const avance = Math.min(pe.avance ?? 0, 100);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Punto de equilibrio
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {formatMoney(pe.periodo!)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Venta necesaria en el periodo para no perder ni ganar
          </p>
        </div>
        {pe.diario !== null && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Por dia de operacion
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
              {formatMoney(pe.diario)}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Entre los {pe.diasActivos} {pe.diasActivos === 1 ? "dia" : "dias"} con venta del
              periodo
            </p>
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Margen de contribucion
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {pe.margenPct!.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            De cada peso vendido, lo que queda para pagar los fijos
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full rounded-full ${alcanzado ? "bg-emerald-500" : "bg-amber-400"}`}
            style={{ width: `${avance}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-neutral-600">
          {alcanzado ? (
            <>
              Alcanzado. Vendiste{" "}
              <span className="font-medium text-emerald-700">
                {formatMoney(Math.abs(pe.faltante!))}
              </span>{" "}
              por encima del equilibrio ({pe.avance!.toFixed(0)}% de la meta).
            </>
          ) : (
            <>
              Llevas <span className="font-medium">{pe.avance!.toFixed(0)}%</span>. Faltan{" "}
              <span className="font-medium text-amber-700">{formatMoney(pe.faltante!)}</span> de
              venta para cubrir los gastos fijos del periodo.
            </>
          )}
        </p>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Gastos fijos del periodo: {formatMoney(pe.gastosFijos)} · Variables:{" "}
        {formatMoney(pe.gastosVariables)}. Cuales son fijos y cuales variables se define en
        Configuracion &gt; Tipos de gasto.
      </p>
    </div>
  );
}
