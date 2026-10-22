import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { createRecipeForRow, ignoreRowAlways, linkRowToExistingRecipe } from "./actions";
import { formatMoney } from "@/lib/format";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const user = await requireSucursalContext();

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, sucursalId: user.sucursalId },
  });
  if (!batch) notFound();

  const [pendingRows, recipes] = await Promise.all([
    prisma.importRow.findMany({
      where: { importBatchId: batch.id, status: "PENDING" },
      orderBy: { rawName: "asc" },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Una tarjeta por NOMBRE, no por renglon. Un archivo con diez ventas de "COCA COLA" traia diez
  // tarjetas identicas pidiendo diez veces la misma decision.
  type Pendiente = {
    rowId: string;
    rawName: string;
    renglones: number;
    piezas: number;
    importe: number;
    fechas: Set<string>;
  };
  const porNombre = new Map<string, Pendiente>();
  for (const row of pendingRows) {
    const actual = porNombre.get(row.normalizedName);
    const piezas = Number(row.quantitySold);
    const importe = piezas * Number(row.unitPrice);
    const fecha = row.date ? row.date.toLocaleDateString("es-MX", { timeZone: "UTC" }) : null;
    if (actual) {
      actual.renglones += 1;
      actual.piezas += piezas;
      actual.importe += importe;
      if (fecha) actual.fechas.add(fecha);
    } else {
      porNombre.set(row.normalizedName, {
        rowId: row.id,
        rawName: row.rawName,
        renglones: 1,
        piezas,
        importe,
        fechas: new Set(fecha ? [fecha] : []),
      });
    }
  }
  const pendientes = [...porNombre.values()].sort((a, b) => a.rawName.localeCompare(b.rawName));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Platillos por reconocer</h1>
      <p className="text-sm text-neutral-500">
        Estos nombres del archivo &quot;{batch.fileName}&quot; no coinciden con ninguna receta
        conocida. Lo que decidas aqui se aplica a todas las ventas de ese nombre, de este archivo
        y de los que vengan.
      </p>

      {pendientes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No quedan platillos pendientes. <Link href="/sales" className="underline">Ir a ventas</Link>
        </p>
      ) : (
        <div className="space-y-4">
          {pendientes.map((pendiente) => {
            const linkAction = linkRowToExistingRecipe.bind(null, batch.id, pendiente.rowId);
            const createAction = createRecipeForRow.bind(null, batch.id, pendiente.rowId);
            const ignoreAction = ignoreRowAlways.bind(null, batch.id, pendiente.rowId);
            const fechas = [...pendiente.fechas];
            return (
              <div key={pendiente.rowId} className="rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
                <p className="font-medium text-neutral-900">{pendiente.rawName}</p>
                <p className="mb-3 text-sm text-neutral-500">
                  {pendiente.renglones === 1
                    ? "1 venta"
                    : `${pendiente.renglones} ventas en el archivo`}{" "}
                  · {pendiente.piezas.toLocaleString("es-MX", { maximumFractionDigits: 2 })}{" "}
                  {pendiente.piezas === 1 ? "pieza" : "piezas"} · {formatMoney(pendiente.importe)}
                  {fechas.length > 0 && (
                    <>
                      {" · "}
                      {fechas.length === 1 ? fechas[0] : `${fechas.length} dias distintos`}
                    </>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <form action={linkAction} className="flex items-center gap-2">
                    <select
                      name="recipeId"
                      required
                      className="rounded-md border border-neutral-200 px-2 py-1 text-sm"
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
                      Vincular{pendiente.renglones > 1 ? ` las ${pendiente.renglones}` : ""}
                    </button>
                  </form>

                  <form action={createAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Crear receta nueva
                    </button>
                  </form>

                  <form action={ignoreAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
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
