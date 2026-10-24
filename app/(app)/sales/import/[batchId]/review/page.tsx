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

  const [pendingRows, cargadas, ignoradas, conError, recipes] = await Promise.all([
    prisma.importRow.findMany({
      where: { importBatchId: batch.id, status: "PENDING" },
      orderBy: { rawName: "asc" },
    }),
    // Lo que ya quedo dentro: es lo que hay que poder ver de un vistazo al terminar.
    prisma.importRow.findMany({
      where: { importBatchId: batch.id, status: "MATCHED" },
      select: { date: true, quantitySold: true, unitPrice: true },
    }),
    prisma.importRow.count({ where: { importBatchId: batch.id, status: "IGNORED" } }),
    prisma.importRow.count({ where: { importBatchId: batch.id, status: "ERROR" } }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const dias = new Set<string>();
  let piezasCargadas = 0;
  let importeCargado = 0;
  for (const fila of cargadas) {
    if (fila.date) dias.add(fila.date.toISOString().slice(0, 10));
    const piezas = Number(fila.quantitySold);
    piezasCargadas += piezas;
    importeCargado += piezas * Number(fila.unitPrice);
  }
  const diasOrdenados = [...dias].sort();
  const rangoFechas =
    diasOrdenados.length === 0
      ? null
      : diasOrdenados.length === 1
        ? new Date(`${diasOrdenados[0]}T00:00:00Z`).toLocaleDateString("es-MX", { timeZone: "UTC" })
        : `${new Date(`${diasOrdenados[0]}T00:00:00Z`).toLocaleDateString("es-MX", { timeZone: "UTC" })} al ${new Date(
            `${diasOrdenados[diasOrdenados.length - 1]}T00:00:00Z`,
          ).toLocaleDateString("es-MX", { timeZone: "UTC" })}`;

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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-base font-semibold text-emerald-900">La venta ya quedo cargada</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            <li>
              <b>{cargadas.length.toLocaleString("es-MX")}</b> renglones cargados ·{" "}
              {piezasCargadas.toLocaleString("es-MX", { maximumFractionDigits: 2 })} piezas ·{" "}
              <b>{formatMoney(importeCargado)}</b>
            </li>
            {rangoFechas && (
              <li>
                {dias.size === 1 ? "Del dia" : `${dias.size} dias:`} {rangoFechas}
              </li>
            )}
            {ignoradas > 0 && (
              <li>{ignoradas} renglones ignorados (nombres marcados como que no son platillo)</li>
            )}
            {conError > 0 && (
              <li className="text-amber-800">
                {conError} renglones no se pudieron leer (fecha o cantidad invalida) y quedaron
                fuera
              </li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href="/sales?vista=dia"
              className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
            >
              Ver ventas por dia
            </Link>
            <Link href="/sales" className="text-sm text-neutral-600 hover:underline">
              Ver ventas por producto
            </Link>
            <Link href="/sales/import" className="text-sm text-neutral-600 hover:underline">
              Cargar otro archivo
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            Ya van <b>{cargadas.length.toLocaleString("es-MX")}</b> renglones cargados por{" "}
            <b>{formatMoney(importeCargado)}</b>. Faltan {pendientes.length}{" "}
            {pendientes.length === 1 ? "nombre" : "nombres"} por reconocer; en cuanto los
            resuelvas, la carga queda completa.
          </p>
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
