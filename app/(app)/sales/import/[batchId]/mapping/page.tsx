import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { processImportBatch } from "../../actions";

export default async function ImportMappingPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const user = await requireOrgSession();

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, organizationId: user.organizationId },
  });
  if (!batch) notFound();

  const headers = batch.headers as string[];
  const rawRows = batch.rawRows as string[][];
  const preview = rawRows.slice(0, 8);

  const processImportBatchWithId = processImportBatch.bind(null, batch.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Mapear columnas</h1>
      <p className="text-sm text-neutral-500">
        Archivo: {batch.fileName} - {rawRows.length} filas detectadas. Indica que columna
        corresponde a cada dato.
      </p>

      <form
        action={processImportBatchWithId}
        className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <label htmlFor="dateHeader" className="text-sm font-medium text-neutral-700">
              Columna de fecha
            </label>
            <select
              id="dateHeader"
              name="dateHeader"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="nameHeader" className="text-sm font-medium text-neutral-700">
              Columna de platillo
            </label>
            <select
              id="nameHeader"
              name="nameHeader"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="qtyHeader" className="text-sm font-medium text-neutral-700">
              Columna de cantidad vendida
            </label>
            <select
              id="qtyHeader"
              name="qtyHeader"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="priceHeader" className="text-sm font-medium text-neutral-700">
              Columna de precio
            </label>
            <select
              id="priceHeader"
              name="priceHeader"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Procesar archivo
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              {headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-neutral-100">
                {headers.map((_, colIdx) => (
                  <td key={colIdx} className="whitespace-nowrap px-3 py-2 text-neutral-600">
                    {row[colIdx] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
