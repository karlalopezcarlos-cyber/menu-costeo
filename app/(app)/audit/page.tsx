import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { computeInventoryAudit } from "@/lib/audit";
import AuditTable from "./AuditTable";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-MX", { timeZone: "UTC" });
}

export default async function AuditPage({
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

  if (counts.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Auditoria de inventario</h1>
        <p className="text-sm text-neutral-500">
          Necesitas al menos un conteo de inventario capturado para poder analizar variaciones.
          Ve a Inventario y registra uno.
        </p>
      </div>
    );
  }

  const defaultInitial = counts[counts.length - 1];
  const initialCountId = params.initial && counts.some((c) => c.id === params.initial)
    ? params.initial
    : defaultInitial.id;

  const initialIndex = counts.findIndex((c) => c.id === initialCountId);
  const countsAfterInitial = counts.slice(initialIndex + 1);
  const defaultFinalId = countsAfterInitial.length > 0 ? countsAfterInitial[0].id : "";

  const finalCountId = params.final !== undefined
    ? (params.final && countsAfterInitial.some((c) => c.id === params.final) ? params.final : "")
    : defaultFinalId;

  const result = await computeInventoryAudit(
    user.organizationId,
    user.sucursalId,
    initialCountId,
    finalCountId || null,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Auditoria de inventario</h1>
        <p className="text-sm text-neutral-500">
          Inventario teorico por producto y subreceta (en cantidad, no en dinero): inicial +
          compras (registradas en Compras o pedidos ya recibidos) + produccion registrada - mermas
          - consumo por produccion de otras subrecetas - consumo por ventas. Cuando captures tu
          siguiente conteo, aqui mismo veras la variacion contra lo real.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="initial" className="text-sm font-medium text-neutral-700">
            Inventario inicial
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
            Inventario final
          </label>
          <select
            id="final"
            name="final"
            defaultValue={finalCountId}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Aun sin capturar (proyeccion a hoy)</option>
            {countsAfterInitial.map((c) => (
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
        <a
          href={`/api/export/audit?initial=${initialCountId}${finalCountId ? `&final=${finalCountId}` : ""}`}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </form>

      {!result.finalDateLabel && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no has capturado un inventario despues del{" "}
          {result.initialDateLabel}: se muestra la proyeccion teorica a hoy. En cuanto registres tu
          siguiente conteo, selecciona lo aqui como &quot;Inventario final&quot; para ver la
          variacion contra lo real.
        </p>
      )}

      <AuditTable rows={result.rows} initialCountId={initialCountId} finalCountId={finalCountId || null} />
    </div>
  );
}
