import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import {
  computeIncomeStatement,
  buildIncomeStatementRows,
  buildIncomeStatementFooterRows,
  INCOME_STATEMENT_ROW_DESCRIPTIONS,
  type IncomeStatementFooterRow,
  type IvaView,
  type IncomeStatementRowView,
} from "@/lib/income-statement";
import { formatMoney } from "@/lib/format";
import IncomeStatementChat from "./IncomeStatementChat";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

/** Las columnas salen de los grupos que definio la organizacion, mas el consolidado al final. */
function columnasDe(result: { groups: { id: string; name: string }[] }) {
  return [
    ...result.groups.map((g) => ({ key: g.id, label: g.name.toUpperCase() })),
    { key: "consolidado", label: "CONSOLIDADO" },
  ];
}

/** Tarjeta de indicador para el resumen de arriba. */
function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueTone =
    tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-red-600" : "text-neutral-900";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function Row({ row }: { row: IncomeStatementRowView }) {
  const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[row.label];
  return (
    <tr className={`border-t border-neutral-100 ${row.bold ? "font-semibold" : ""} ${row.highlight ? "bg-amber-50" : ""}`}>
      <td className="px-2 py-2" title={description}>
        {row.label}
      </td>
      {row.cells.map((col, index) => {
        const value = col.amount;
        const pct = col.pct;
        return (
          <Fragment key={col.key}>
            <td
              className={`px-3 py-2 text-right ${index > 0 ? "border-l border-neutral-200" : ""} ${
                value < 0 ? "text-red-600" : ""
              }`}
            >
              {formatMoney(value)}
            </td>
            <td className={`px-3 py-2 text-right ${pct !== null && pct < 0 ? "text-red-600" : "text-neutral-500"}`}>
              {row.pctMode === "none" ? "" : pct !== null ? `${pct.toFixed(2)}%` : "-"}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

/**
 * Renglon del pie: un solo numero, en la columna del consolidado. Los gastos y la utilidad no
 * se parten entre alimento y bebidas, asi que las columnas de grupo van vacias.
 */
function FooterRow({ row, columnas }: { row: IncomeStatementFooterRow; columnas: { key: string }[] }) {
  const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[row.label];
  return (
    <tr
      className={`border-t border-neutral-100 transition-colors hover:bg-neutral-50 ${
        row.bold ? "font-semibold" : ""
      } ${row.highlight ? "bg-amber-50" : ""} ${row.detail ? "text-neutral-500" : ""}`}
    >
      {/* El desglose va sangrado y en gris: cuelga del renglon de arriba y no se suma aparte. */}
      <td className={`py-2 ${row.detail ? "pl-6 pr-2 text-xs" : "px-2"}`} title={description}>
        {row.detail ? `— ${row.label}` : row.label}
      </td>
      {columnas.map((col, index) => {
        if (col.key !== "consolidado") {
          return (
            <td
              key={col.key}
              className={`px-3 py-2 ${index > 0 ? "border-l border-neutral-200" : ""}`}
              colSpan={2}
            />
          );
        }
        return (
          <Fragment key={col.key}>
            <td
              className={`px-3 py-2 text-right border-l border-neutral-200 ${
                row.amount < 0 ? "text-red-600" : ""
              }`}
            >
              {formatMoney(row.amount)}
            </td>
            <td
              className={`px-3 py-2 text-right ${
                row.pct !== null && row.pct < 0 ? "text-red-600" : "text-neutral-500"
              }`}
            >
              {row.pct !== null ? `${row.pct.toFixed(2)}%` : ""}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ initial?: string; final?: string; iva?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSucursalContext();

  const counts = await prisma.inventoryCount.findMany({
    where: { sucursalId: user.sucursalId },
    orderBy: { date: "asc" },
    select: { id: true, date: true },
  });

  if (counts.length < 2) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Estado de Resultados</h1>
        <p className="text-sm text-neutral-500">
          Necesitas al menos dos conteos de inventario (inicial y final) para ver el estado de
          resultados del periodo. Ve a Inventario y registra otro conteo.
        </p>
      </div>
    );
  }

  const defaultFinal = counts[counts.length - 1];
  const defaultInitial = counts[counts.length - 2];

  const initialCountId = params.initial && counts.some((c) => c.id === params.initial)
    ? params.initial
    : defaultInitial.id;
  const finalCountId = params.final && counts.some((c) => c.id === params.final)
    ? params.final
    : defaultFinal.id;

  const selectedInitial = counts.find((c) => c.id === initialCountId)!;
  const selectedFinal = counts.find((c) => c.id === finalCountId)!;
  const orderedInitialId = selectedInitial.date <= selectedFinal.date ? initialCountId : finalCountId;
  const orderedFinalId = selectedInitial.date <= selectedFinal.date ? finalCountId : initialCountId;

  // Sin IVA por omision: es la unica vista en la que la venta y el costo estan medidos con la
  // misma regla. Hay que pedir expresamente la otra.
  const ivaView: IvaView = params.iva === "con" ? "conIva" : "sinIva";
  const result = await computeIncomeStatement(
    user.organizationId,
    user.sucursalId,
    orderedInitialId,
    orderedFinalId,
    ivaView,
  );
  const rows = buildIncomeStatementRows(result);
  const footerRows = buildIncomeStatementFooterRows(result);
  const columnas = columnasDe(result);
  // Concepto + monto y % por cada columna.
  const totalColumnas = 1 + columnas.length * 2;
  const exportQuery = `?initial=${orderedInitialId}&final=${orderedFinalId}&iva=${
    ivaView === "conIva" ? "con" : "sin"
  }`;
  const ventaTotal = result.ventaTotal.consolidado;
  // El neto, no el bruto: es el que se compara contra el costo teorico del mosaico de al lado,
  // y la Variacion del tercero es exactamente la resta de esos dos. Con el bruto, los tres
  // numeros de esta fila no cerrarian entre si.
  // Esconder los botones no protege nada por si solo -la ruta es la que decide-, pero ofrecer
  // una descarga que va a devolver 403 es peor que no ofrecerla.
  const puedeDescargar = hasPermission(user.role, user.permissions, "EXPORT_INCOME_STATEMENT");

  const costoPct = ventaTotal !== 0 ? (result.costoNetoDeVentas.consolidado / ventaTotal) * 100 : null;
  const potencialPct = ventaTotal !== 0 ? (result.costoPotencial.consolidado / ventaTotal) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            {result.organizationName} — {result.sucursalName}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Estado de Resultados
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {result.initialDateLabel} - {result.finalDateLabel}
          </p>
          {/* Que vista se esta leyendo, en el encabezado y no escondido en el filtro: los dos
              reportes se imprimen igual y se confunden en cuanto salen de la pantalla. */}
          <p className="mt-1 text-xs text-neutral-500">
            {ivaView === "conIva" ? (
              <>
                <span className="font-medium text-amber-700">Ventas y gastos CON IVA.</span> Los
                costos siempre son netos, asi que los porcentajes salen mas bajos de lo real.
                Sirve para cuadrar contra el banco, no para medir el costo.
              </>
            ) : (
              <>
                <span className="font-medium text-neutral-700">Todo sin IVA.</span> A la venta de
                carta y a los gastos se les quito el impuesto para medirlos con la misma regla que
                el costo.
              </>
            )}
          </p>
        </div>
        {puedeDescargar && (
          <div className="flex items-center gap-3">
            <a
              href={`/api/export/income-statement${exportQuery}`}
              className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              Descargar Excel
            </a>
            <a
              href={`/api/export/income-statement/pdf${exportQuery}`}
              className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              Descargar PDF
            </a>
          </div>
        )}
      </div>

      {result.sinAlmacen ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Este reporte dice cuanto ganaste en teoria.</p>
            <p className="mt-1 text-amber-800">
              En el periodo no hay nada de almacen: ni inventarios, ni compras, ni traspasos. Sin
              eso el costo real no se puede calcular, asi que el costo que ves sale de lo que
              cuesta cada platillo por su cantidad vendida. Lo que todavia no se puede ver es la
              diferencia entre ese costo y el que de verdad salio del almacen, que es donde se
              esconde la merma, el robo y el descontrol de porciones. En cuanto captures compras
              e inventarios, el reporte completo aparece solo.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile label="Venta total" value={formatMoney(result.ventaTotal.consolidado)} hint="Periodo seleccionado" />
            <StatTile
              label="Costo de ventas estimado"
              value={formatMoney(result.costoReconocido.consolidado)}
              hint={potencialPct !== null ? `${potencialPct.toFixed(2)}% de la venta total` : "Sin venta en el periodo"}
            />
            <StatTile
              label="Venta promedio diaria"
              value={formatMoney(result.ventaPromedioDiaria.consolidado)}
              hint={`${result.diasActivos} ${result.diasActivos === 1 ? "dia con venta" : "dias con venta"}`}
            />
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Venta total" value={formatMoney(result.ventaTotal.consolidado)} hint="Periodo seleccionado" />
          <StatTile
            label="Costo neto de ventas"
            value={formatMoney(result.costoNetoDeVentas.consolidado)}
            hint={costoPct !== null ? `${costoPct.toFixed(2)}% de la venta total` : "Sin venta en el periodo"}
          />
          <StatTile
            label="Costo teorico"
            value={potencialPct !== null ? `${potencialPct.toFixed(2)}%` : "-"}
            hint={`Segun receta: ${formatMoney(result.costoPotencial.consolidado)}`}
          />
          <StatTile
            label="Variacion"
            value={formatMoney(result.variacion.consolidado)}
            tone={result.variacion.consolidado >= 0 ? "positive" : "negative"}
            hint={result.variacion.consolidado >= 0 ? "Favorable: costo real menor al teorico" : "Desfavorable: costo real mayor al teorico"}
          />
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
        <div className="space-y-1">
          <label htmlFor="initial" className="text-sm font-medium text-neutral-700">
            Fecha inicial (inventario)
          </label>
          <select
            id="initial"
            name="initial"
            defaultValue={initialCountId}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="final" className="text-sm font-medium text-neutral-700">
            Fecha final (inventario)
          </label>
          <select
            id="final"
            name="final"
            defaultValue={finalCountId}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)}
              </option>
            ))}
          </select>
        </div>
        {/* La vista viaja escondida en el formulario para que cambiar de fecha no la pierda:
            los botones de abajo son los que la cambian. */}
        <input type="hidden" name="iva" value={ivaView === "conIva" ? "con" : "sin"} />
        <button
          type="submit"
          className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Ver
        </button>
        {/* Dos botones y no un desplegable, igual que en Ingenieria de menu: se ve de un
            vistazo cual de las dos vistas se esta leyendo, sin tener que abrir nada. */}
        <div className="flex overflow-hidden rounded-md border border-neutral-200">
          <Link
            href={`/dashboard?initial=${orderedInitialId}&final=${orderedFinalId}&iva=con`}
            className={`px-3 py-2 text-sm font-medium ${
              ivaView === "conIva"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Analizar con IVA
          </Link>
          <Link
            href={`/dashboard?initial=${orderedInitialId}&final=${orderedFinalId}&iva=sin`}
            className={`px-3 py-2 text-sm font-medium ${
              ivaView === "sinIva"
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Analizar sin IVA
          </Link>
        </div>
      </form>
      <p className="text-xs text-neutral-500">
        Solo se pueden elegir fechas con un conteo de inventario capturado. Las columnas son tus
        grupos de costo (Configuracion &gt; Grupos de costo); lo que tenga categoria sin grupo
        sale en una columna aparte hasta que lo acomodes.
      </p>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-neutral-900 text-white">
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em]">CONCEPTO</th>
              {columnas.map((col, index) => (
                <th
                  key={col.key}
                  className={`px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] ${index > 0 ? "border-l border-neutral-700" : ""}`}
                  colSpan={2}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 3).map((row) => (
              <Row key={row.label} row={row} />
            ))}

            <tr className="border-t border-neutral-100">
              <td className="px-2 py-2 text-neutral-500" colSpan={totalColumnas}>
                &nbsp;
              </td>
            </tr>

            {/* De Inventario inicial a Variacion. Se recorren todos: antes se listaban por
                indice y los renglones nuevos se quedaban sin salir en pantalla. */}
            {rows.slice(3).map((row) => (
              <Row key={row.label} row={row} />
            ))}

            <tr className="border-t border-neutral-100">
              <td className="px-2 py-2 text-neutral-500" colSpan={totalColumnas}>
                &nbsp;
              </td>
            </tr>

            {footerRows.map((row) => (
              <FooterRow key={row.label} row={row} columnas={columnas} />
            ))}

            <tr>
              <td className="px-2 py-2 text-xs text-neutral-400" colSpan={totalColumnas}>
                {result.diasActivos} dias activos (con venta registrada) en el periodo. Los gastos
                no se reparten entre las columnas: son del negocio entero.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <IncomeStatementChat
        initialCountId={orderedInitialId}
        finalCountId={orderedFinalId}
        ivaView={ivaView}
      />
    </div>
  );
}
