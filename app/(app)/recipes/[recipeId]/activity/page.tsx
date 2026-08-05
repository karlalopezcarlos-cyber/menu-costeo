import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { getRecipeTimeline } from "@/lib/recipe-activity";
import ActivityTimeline from "./ActivityTimeline";

export default async function RecipeActivityPage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const user = await requireSucursalContext();

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, sucursalId: user.sucursalId },
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

      <ActivityTimeline timeline={timeline} />

      <Link href="/recipes" className="inline-block text-sm text-neutral-500 hover:underline">
        Volver a recetas
      </Link>
    </div>
  );
}
