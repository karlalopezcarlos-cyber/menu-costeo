import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import RecipeCategoryTable, { type RecipeCategoryRow } from "./RecipeCategoryTable";

export default async function RecipeCategoriesPage() {
  const user = await requireSucursalContext();

  const [recipes, categories] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, categoryId: true, isMenuItem: true },
    }),
    prisma.recipeCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: RecipeCategoryRow[] = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    categoryId: recipe.categoryId,
    isMenuItem: recipe.isMenuItem,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Recetas
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Acomodar las categorias
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            La categoria de cada receta en una sola pantalla, sin entrar una por una. Es la que
            decide en que grupo de costo cae su venta en el estado de resultados y como se agrupa
            en ingenieria de menu.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/recipe-categories"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Administrar categorias
          </Link>
          <Link
            href="/recipes"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
          >
            Volver a recetas
          </Link>
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavia no tienes categorias de receta dadas de alta.{" "}
          <Link href="/settings/recipe-categories" className="font-medium underline">
            Crealas primero
          </Link>{" "}
          y regresa aqui a asignarlas.
        </p>
      ) : (
        <RecipeCategoryTable rows={rows} categories={categories} />
      )}
    </div>
  );
}
