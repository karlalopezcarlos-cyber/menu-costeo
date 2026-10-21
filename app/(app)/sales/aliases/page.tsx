import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import AliasTable, { type AliasRow } from "./AliasTable";
import RecomputeSalesButton from "./RecomputeSalesButton";

export default async function SalesAliasesPage() {
  const user = await requireSucursalContext();

  const [aliases, recipes, conteos] = await Promise.all([
    prisma.dishAlias.findMany({
      where: { sucursalId: user.sucursalId },
      orderBy: { externalName: "asc" },
      include: { recipe: { select: { id: true, name: true, archivedAt: true } } },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null, isMenuItem: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Cuantos renglones importados trae cada nombre: es lo que se moveria al corregirlo.
    prisma.importRow.groupBy({
      by: ["normalizedName"],
      where: { status: "MATCHED", importBatch: { sucursalId: user.sucursalId } },
      _count: { _all: true },
    }),
  ]);

  const conteoPorNombre = new Map(conteos.map((c) => [c.normalizedName, c._count._all]));

  const rows: AliasRow[] = aliases.map((alias) => ({
    id: alias.id,
    externalName: alias.externalName,
    recipeId: alias.recipeId,
    recipeName: alias.recipe?.name ?? null,
    recipeArchived: alias.recipe?.archivedAt !== null && alias.recipe?.archivedAt !== undefined,
    ignored: alias.ignored,
    importedRows: conteoPorNombre.get(alias.normalizedName) ?? 0,
  }));

  const sinVincular = rows.filter((r) => !r.recipeId && !r.ignored).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Ventas</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Vinculaciones de venta
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            Como se llama cada platillo en tu punto de venta y a que receta corresponde. Esto es lo
            que manda al importar ventas: si una quedo mal, aqui se corrige y todas las
            importaciones siguientes salen bien.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RecomputeSalesButton />
          <Link href="/sales" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Volver a ventas
          </Link>
        </div>
      </div>

      {sinVincular > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {sinVincular} {sinVincular === 1 ? "nombre esta" : "nombres estan"} sin platillo: sus
          ventas no se estan contando. Vinculalos o marcalos como que no son platillo.
        </p>
      )}

      <AliasTable rows={rows} recipes={recipes} />
    </div>
  );
}
