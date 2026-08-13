import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import {
  computeIncomeStatement,
  buildIncomeStatementRows,
  INCOME_STATEMENT_ROW_DESCRIPTIONS,
  type GroupAmounts,
  type IncomeStatementRowView,
} from "@/lib/income-statement";
import { formatMoney } from "@/lib/format";
import IncomeStatementChat from "./IncomeStatementChat";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

const GROUP_COLUMNS: {
  key: keyof GroupAmounts;
  pctKey: "alimentoPct" | "bebidasPct" | "miscelaneosPct" | "consolidadoPct";
  label: string;
}[] = [
  { key: "alimento", pctKey: "alimentoPct", label: "ALIMENTO" },
  { key: "bebidas", pctKey: "bebidasPct", label: "BEBIDAS" },
  { key: "miscelaneos", pctKey: "miscelaneosPct", label: "MISCELANEOS" },
  { key: "consolidado", pctKey: "consolidadoPct", label: "CONSOLIDADO" },
];

function Row({ row }: { row: IncomeStatementRowView }) {
  const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[row.label];
  return (
    <tr className={`border-t border-neutral-100 ${row.bold ? "font-semibold" : ""} ${row.highlight ? "bg-amber-50" : ""}`}>
      <td className="px-2 py-2" title={description}>
        {row.label}
      </td>
      {GROUP_COLUMNS.map((col, index) => {
        const value = row[col.key];
        const pct = row[col.pctKey];
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ initial?: string; final?: string }>;
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
        <h1 className="text-2xl font-semibold text-neutral-900">Estado de Resultados</h1>
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

  const result = await computeIncomeStatement(
    user.organizationId,
    user.sucursalId,
    orderedInitialId,
    orderedFinalId,
  );
  const rows = buildIncomeStatementRows(result);
  const exportQuery = `?initial=${orderedInitialId}&final=${orderedFinalId}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Estado de Resultados</h1>
          <p className="text-sm text-neutral-500">
            {result.organizationName} — {result.sucursalName}
          </p>
          <p className="text-sm text-neutral-500">
            {result.initialDateLabel} - {result.finalDateLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/export/income-statement${exportQuery}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Descargar Excel
          </a>
          <a
            href={`/api/export/income-statement/pdf${exportQuery}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Descargar PDF
          </a>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="initial" className="text-sm font-medium text-neutral-700">
            Fecha inicial (inventario)
          </label>
          <select
            id="initial"
            name="initial"
            defaultValue={initialCountId}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
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
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {counts.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Ver
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        Solo se pueden elegir fechas con un conteo de inventario capturado. Las categorias sin
        grupo asignado (Configuracion &gt; Categorias) se consolidan en Miscelaneos.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-neutral-800 text-white">
              <th className="px-2 py-2 text-left font-medium">CONCEPTO</th>
              {GROUP_COLUMNS.map((col, index) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 text-center font-medium ${index > 0 ? "border-l border-neutral-600" : ""}`}
                  colSpan={2}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row row={rows[0]} />
            <Row row={rows[1]} />
            <Row row={rows[2]} />

            <tr className="border-t border-neutral-100">
              <td className="px-2 py-2 text-neutral-500" colSpan={9}>
                &nbsp;
              </td>
            </tr>

            <Row row={rows[3]} />
            <Row row={rows[4]} />
            <Row row={rows[5]} />
            <Row row={rows[6]} />
            <Row row={rows[7]} />
            <Row row={rows[8]} />
            <Row row={rows[9]} />
            <Row row={rows[10]} />

            <tr className="border-t border-neutral-100">
              <td className="px-2 py-2" title={INCOME_STATEMENT_ROW_DESCRIPTIONS["Monto pagado"]}>
                Monto pagado
              </td>
              {GROUP_COLUMNS.map((col, index) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-right ${index > 0 ? "border-l border-neutral-200" : ""}`}
                  colSpan={2}
                >
                  {col.key === "consolidado" ? formatMoney(result.montoPagado) : ""}
                </td>
              ))}
            </tr>

            <tr className="border-t border-neutral-100 font-semibold">
              <td className="px-2 py-2" title={INCOME_STATEMENT_ROW_DESCRIPTIONS["Venta promedio diaria"]}>
                Venta promedio diaria
              </td>
              {GROUP_COLUMNS.map((col, index) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-right ${index > 0 ? "border-l border-neutral-200" : ""}`}
                  colSpan={2}
                >
                  {col.key === "consolidado" ? formatMoney(result.ventaPromedioDiaria.consolidado) : ""}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-2 py-2 text-xs text-neutral-400" colSpan={9}>
                {result.diasActivos} dias activos (con venta registrada) en el periodo.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <IncomeStatementChat initialCountId={orderedInitialId} finalCountId={orderedFinalId} />
    </div>
  );
}
