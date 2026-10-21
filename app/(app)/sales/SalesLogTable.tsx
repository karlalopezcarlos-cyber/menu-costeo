import { formatMoney } from "@/lib/format";

export type SaleLogRow = {
  id: string;
  whenLabel: string;
  saleDateLabel: string;
  recipeName: string;
  action: string;
  previousQuantity: number | null;
  newQuantity: number | null;
  previousPrice: number | null;
  newPrice: number | null;
  source: string;
  userName: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  create: "Registro",
  update: "Correccion",
  delete: "Eliminacion",
};

const SOURCE_LABELS: Record<string, string> = {
  import: "Importado",
  pos: "Ticket POS",
  manual: "Manual",
};

function cambio(antes: number | null, despues: number | null, money: boolean): string {
  const f = (n: number) => (money ? formatMoney(n) : n.toLocaleString("es-MX", { maximumFractionDigits: 2 }));
  if (antes === null && despues === null) return "—";
  if (antes === null) return f(despues!);
  if (despues === null) return `${f(antes)} → eliminada`;
  if (antes === despues) return f(despues);
  return `${f(antes)} → ${f(despues)}`;
}

/**
 * Bitacora de ventas: quien capturo cada venta y quien la corrigio despues.
 *
 * Solo recoge lo que se hizo desde el sistema. Una venta que llego en un archivo aparece a
 * nombre de quien subio el archivo, no renglon por renglon: el detalle de ese archivo vive en la
 * importacion.
 */
export default function SalesLogTable({ rows }: { rows: SaleLogRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Cuando</th>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Quien</th>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Que hizo</th>
            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Venta</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
              Cantidad
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
              Precio
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
                No hay movimientos registrados para las ventas de este periodo.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-neutral-100 align-top">
              <td className="px-4 py-3 text-neutral-500">{row.whenLabel}</td>
              <td className="px-4 py-3 font-medium text-neutral-900">
                {row.userName ?? <span className="font-normal text-neutral-400">—</span>}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    row.action === "delete"
                      ? "bg-red-100 text-red-700"
                      : row.action === "update"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </p>
              </td>
              <td className="px-4 py-3">
                <p className="text-neutral-900">{row.recipeName}</p>
                <p className="text-xs text-neutral-500">del {row.saleDateLabel}</p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                {cambio(row.previousQuantity, row.newQuantity, false)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-neutral-600">
                {cambio(row.previousPrice, row.newPrice, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
