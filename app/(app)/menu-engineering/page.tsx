import Link from "next/link";
import { requireSucursalContext } from "@/lib/tenant";
import { computeMenuEngineeringReport, type IvaMode } from "@/lib/menu-engineering";
import MenuEngineeringTable, { type MenuEngineeringRowView } from "./MenuEngineeringTable";
import MenuEngineeringChatDialog from "./MenuEngineeringChatDialog";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function MenuEngineeringPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; iva?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSucursalContext();

  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const fromDate = params.from ? new Date(`${params.from}T00:00:00Z`) : defaultFrom;
  const toDate = params.to ? new Date(`${params.to}T00:00:00Z`) : defaultTo;
  const ivaMode: IvaMode = params.iva === "sin" ? "sin" : "con";

  const rows = await computeMenuEngineeringReport(user.sucursalId, fromDate, toDate, ivaMode);
  const rowViews: MenuEngineeringRowView[] = rows.map((row) => ({
    recipeId: row.recipeId,
    recipeName: row.recipeName,
    quantitySold: row.quantitySold.toNumber(),
    unitPrice: row.unitPrice.toNumber(),
    cost: row.cost.toNumber(),
    margin: row.margin.toNumber(),
    costPct: row.costPct !== null ? row.costPct.toNumber() : null,
    popularity: row.popularity.toNumber(),
    classification: row.classification,
    costUnreliable: row.costUnreliable,
  }));

  const baseQuery = `from=${toDateInputValue(fromDate)}&to=${toDateInputValue(toDate)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-neutral-900">Ingenieria de menu</h1>
        <div className="flex items-center gap-3">
          {rowViews.length > 0 && (
            <MenuEngineeringChatDialog
              from={toDateInputValue(fromDate)}
              to={toDateInputValue(toDate)}
              iva={ivaMode}
            />
          )}
          <a
            href={`/api/export/menu-engineering?${baseQuery}&iva=${ivaMode}`}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Exportar a Excel
          </a>
        </div>
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

      {rowViews.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No hay ventas capturadas para este periodo todavia.
        </p>
      ) : (
        <MenuEngineeringTable rows={rowViews} ivaMode={ivaMode} />
      )}
    </div>
  );
}
