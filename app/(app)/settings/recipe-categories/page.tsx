import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { deleteRecipeCategory, updateRecipeCategoryGroup, updateRecipeCategoryName } from "./actions";
import NewRecipeCategoryForm from "./NewRecipeCategoryForm";
import SettingsNav from "../SettingsNav";
import CategoryGroupSelect from "../CategoryGroupSelect";
import InlineNameEditor from "../InlineNameEditor";

export default async function RecipeCategoriesPage() {
  const user = await requireOrgSession();

  const categories = await prisma.recipeCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { recipes: true } } },
  });

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/recipe-categories" />
        <p className="mt-3 text-sm text-neutral-500">
          Estas categorias aparecen como lista desplegable al crear una receta nueva.
        </p>
      </div>

      <NewRecipeCategoryForm />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Recetas</th>
              <th className="px-4 py-2 font-medium">Grupo (Estado de Resultados)</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay categorias.
                </td>
              </tr>
            )}
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <InlineNameEditor id={category.id} initialName={category.name} action={updateRecipeCategoryName} />
                </td>
                <td className="px-4 py-2 text-neutral-500">{category._count.recipes}</td>
                <td className="px-4 py-2">
                  <CategoryGroupSelect
                    categoryId={category.id}
                    initialGroup={category.group}
                    action={updateRecipeCategoryGroup}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await deleteRecipeCategory(category.id);
                    }}
                  >
                    <button type="submit" className="text-neutral-400 hover:text-red-600">
                      Borrar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
