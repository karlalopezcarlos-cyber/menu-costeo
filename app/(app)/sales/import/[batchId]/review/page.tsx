import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { createRecipeForRow, ignoreRowAlways, linkRowToExistingRecipe } from "./actions";
import { formatMoney } from "@/lib/format";

export default async function ImportReviewPage({
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

  const [pendingRows, recipes] = await Promise.all([
    prisma.importRow.findMany({
      where: { importBatchId: batch.id, status: "PENDING" },
      orderBy: { rawName: "asc" },
    }),
    prisma.recipe.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Platillos por reconocer</h1>
      <p className="text-sm text-neutral-500">
        Estos nombres del archivo "{batch.fileName}" no coinciden con ninguna receta conocida.
        Resuelvelos una vez; en cargas futuras se reconoceran solos.
      </p>

      {pendingRows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No quedan platillos pendientes. <Link href="/sales" className="underline">Ir a ventas</Link>
        </p>
      ) : (
        <div className="space-y-4">
          {pendingRows.map((row) => {
            const linkAction = linkRowToExistingRecipe.bind(null, batch.id, row.id);
            const createAction = createRecipeForRow.bind(null, batch.id, row.id);
            const ignoreAction = ignoreRowAlways.bind(null, batch.id, row.id);
            return (
              <div key={row.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="font-medium text-neutral-900">{row.rawName}</p>
                <p className="mb-3 text-sm text-neutral-500">
                  Fecha: {row.date ? row.date.toLocaleDateString("es-MX", { timeZone: "UTC" }) : "-"} - Cantidad:{" "}
                  {row.quantitySold.toString()} - Precio: {formatMoney(Number(row.unitPrice))}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <form action={linkAction} className="flex items-center gap-2">
                    <select
                      name="recipeId"
                      required
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    >
                      <option value="">Vincular a receta existente...</option>
                      {recipes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                    >
                      Vincular
                    </button>
                  </form>

                  <form action={createAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Crear receta nueva
                    </button>
                  </form>

                  <form action={ignoreAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
                    >
                      Ignorar siempre (no es un platillo)
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
