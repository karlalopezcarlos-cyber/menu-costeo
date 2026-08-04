import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { deleteCategory } from "./actions";
import NewCategoryForm from "./NewCategoryForm";
import SettingsNav from "../SettingsNav";

export default async function ProductCategoriesPage() {
  const user = await requireOrgSession();

  const categories = await prisma.productCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/categories" />
        <p className="mt-3 text-sm text-neutral-500">
          Estas categorias aparecen como lista desplegable al crear o editar un producto.
        </p>
      </div>

      <NewCategoryForm />

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Productos</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay categorias.
                </td>
              </tr>
            )}
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{category.name}</td>
                <td className="px-4 py-2 text-neutral-500">{category._count.products}</td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await deleteCategory(category.id);
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
