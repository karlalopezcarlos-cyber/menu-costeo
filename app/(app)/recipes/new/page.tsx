import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import NewRecipeForm from "./NewRecipeForm";

export default async function NewRecipePage() {
  const user = await requireOrgSession();
  const categories = await prisma.recipeCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold text-neutral-900">Nueva receta</h1>
      <NewRecipeForm categories={categories} />
    </div>
  );
}
