import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { getRecipeTimeline } from "@/lib/recipe-activity";

const TYPE_BADGE: Record<string, string> = {
  CREATED: "bg-blue-100 text-blue-800",
  ITEM_ADDED: "bg-green-100 text-green-800",
  ITEM_REMOVED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-neutral-200 text-neutral-700",
  UPDATED: "bg-purple-100 text-purple-800",
};

const TYPE_LABEL: Record<string, string> = {
  CREATED: "Creacion",
  ITEM_ADDED: "Ingrediente agregado",
  ITEM_REMOVED: "Ingrediente quitado",
  ARCHIVED: "Archivado",
  UPDATED: "Datos actualizados",
};

export default async function RecipeActivityPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const user = await requireOrgSession();

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  if (!recipe) notFound();

  const timeline = await getRecipeTimeline(user.organizationId, recipe.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{recipe.name}</h1>
        <nav className="mt-3 flex gap-4 border-b border-neutral-200 text-sm">
          <Link href={`/recipes/${recipe.id}`} className="pb-2 text-neutral-500 hover:text-neutral-900">
            Detalle
          </Link>
          <span className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900">
            Bitacora
          </span>
        </nav>
      </div>

      {timeline.length === 0 ? (
        <p className="text-sm text-neutral-500">Todavia no hay movimientos registrados para esta receta.</p>
      ) : (
        <ul className="space-y-2">
          {timeline.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div>
                <span
                  className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[entry.type] ?? "bg-neutral-100 text-neutral-700"}`}
                >
                  {TYPE_LABEL[entry.type] ?? entry.type}
                </span>
                <span className="text-sm text-neutral-800">{entry.message}</span>
              </div>
              <span className="whitespace-nowrap text-xs text-neutral-400">
                {entry.date.toLocaleString("es-MX")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/recipes" className="inline-block text-sm text-neutral-500 hover:underline">
        Volver a recetas
      </Link>
    </div>
  );
}
