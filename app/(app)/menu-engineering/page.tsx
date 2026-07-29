import Link from "next/link";
import { requireOrgSession } from "@/lib/tenant";
import { computeMenuEngineeringReport, CLASSIFICATION_LABELS, type IvaMode } from "@/lib/menu-engineering";

const BADGE_CLASSES: Record<string, string> = {
  STAR: "bg-green-100 text-green-800",
  PLOWHORSE: "bg-blue-100 text-blue-800",
  PUZZLE: "bg-amber-100 text-amber-800",
  DOG: "bg-red-100 text-red-800",
};

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function MenuEngineeringPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; iva?: string }>;
}) {
  const params = await searchParams;
  const user = await requireOrgSession();

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const fromDate = params.from ? new Date(`${params.from}T00:00:00Z`) : defaultFrom;
  const toDate = params.to ? new Date(`${params.to}T00:00:00Z`) : defaultTo;
  const ivaMode: IvaMode = params.iva === "sin" ? "sin" : "con";

  const rows = await computeMenuEngineeringReport(user.organizationId, fromDate, toDate, ivaMode);

  const baseQuery = `from=${toDateInputValue(fromDate)}&to=${toDateInputValue(toDate)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Ingenieria de menu</h1>
        <a
          href={`/api/export/menu-engineering?${baseQuery}&iva=${ivaMode}`}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form className="flex items-end gap-3">
          <input type="hidden" name="iva" value={ivaMode} />
          <div className="space-y-1">
            <label htmlFor="from" className="text-sm font-medium text-neutral-700">
              Desde
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={toDateInputValue(fromDate)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="to" className="text-sm font-medium text-neutral-700">
              Hasta
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toDateInputValue(toDate)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Ver
          </button>
        </form>

        <div className="flex overflow-hidden rounded-md border border-neutral-300">
          <Link
            href={`/menu-engineering?${baseQuery}&iva=con`}
            className={`px-3 py-2 text-sm font-medium ${
              ivaMode === "con" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Analizar con IVA
          </Link>
          <Link
            href={`/menu-engineering?${baseQuery}&iva=sin`}
            className={`px-3 py-2 text-sm font-medium ${
              ivaMode === "sin" ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            Analizar sin IVA
          </Link>
        </div>
      </div>

      {ivaMode === "sin" && (
        <p className="text-xs text-neutral-500">
          El precio de venta se divide entre 1.16 (se le quita el IVA incluido) antes de calcular margen,
          costo % y clasificacion.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No hay ventas capturadas para este periodo todavia.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Platillo</th>
                <th className="px-4 py-2 font-medium">Cantidad vendida</th>
                <th className="px-4 py-2 font-medium">
                  Precio{ivaMode === "sin" ? " (sin IVA)" : ""}
                </th>
                <th className="px-4 py-2 font-medium">Costo</th>
                <th className="px-4 py-2 font-medium">Margen</th>
                <th className="px-4 py-2 font-medium">Costo %</th>
                <th className="px-4 py-2 font-medium">% Popularidad</th>
                <th className="px-4 py-2 font-medium">Clasificacion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.recipeId} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    {row.recipeName}
                    {row.costUnreliable && (
                      <span
                        title="Este platillo tiene costo $0 o no confiable; probablemente falte capturar compras del insumo."
                        className="ml-2 text-amber-500"
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{row.quantitySold.toString()}</td>
                  <td className="px-4 py-2">${row.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-2">${row.cost.toFixed(2)}</td>
                  <td className="px-4 py-2">${row.margin.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    {row.costPct ? (
                      <span
                        className={
                          row.costPct.gt(35)
                            ? "font-medium text-red-600"
                            : row.costPct.gt(25)
                              ? "font-medium text-amber-600"
                              : "font-medium text-green-700"
                        }
                      >
                        {row.costPct.toFixed(1)}%
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-2">{row.popularity.times(100).toFixed(1)}%</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[row.classification]}`}
                    >
                      {CLASSIFICATION_LABELS[row.classification]}
                    </span>
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
