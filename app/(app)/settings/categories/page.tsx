import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import {
  deleteCategory,
  updateCategoryGroup,
  updateCategoryInventoriable,
  updateCategoryName,
  updateCategoryExpense,
  updateCategoryTransformable,
} from "./actions";
import NewCategoryForm from "./NewCategoryForm";
import SettingsNav from "../SettingsNav";
import CategoryGroupSelect from "../CategoryGroupSelect";
import InlineNameEditor from "../InlineNameEditor";
import InventoriableToggle from "../InventoriableToggle";

export default async function ProductCategoriesPage() {
  const user = await requireOrgSession();

  const costGroups = await prisma.costGroup.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const categories = await prisma.productCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/categories" />
        <p className="mt-3 text-sm text-neutral-500">
          Estas categorias aparecen como lista desplegable al crear o editar un producto. Las que
          no se cuentan (servilletas, gas, desechables) se siguen comprando y costeando igual,
          pero dejan de pedirse en la hoja de inventario. Las que se transforman (carnes,
          pescados y mariscos) son las unicas que se ofrecen al limpiar o porcionar; si no
          marcas ninguna, ahi se siguen ofreciendo todas. Y las marcadas como <b>gasto</b> (agua,
          gas, desechables, limpieza) salen del costo de ventas: sus compras aparecen en su
          propio renglon del Estado de Resultados.
        </p>
      </div>

      <NewCategoryForm />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Nombre</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Productos</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Grupo (Estado de Resultados)</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Inventario</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Transformaciones</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Gasto</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay categorias.
                </td>
              </tr>
            )}
            {categories.map((category) => (
              <tr key={category.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <InlineNameEditor id={category.id} initialName={category.name} action={updateCategoryName} />
                </td>
                <td className="px-4 py-3 text-neutral-500">{category._count.products}</td>
                <td className="px-4 py-3">
                  <CategoryGroupSelect
                    categoryId={category.id}
                    initialGroup={category.costGroupId}
                    groups={costGroups}
                    action={updateCategoryGroup}
                  />
                </td>
                <td className="px-4 py-3">
                  <InventoriableToggle
                    categoryId={category.id}
                    initialValue={category.isInventoriable}
                    action={updateCategoryInventoriable}
                  />
                </td>
                <td className="px-4 py-3">
                  <InventoriableToggle
                    categoryId={category.id}
                    initialValue={category.isTransformable}
                    action={updateCategoryTransformable}
                    label="Se transforma"
                  />
                </td>
                <td className="px-4 py-3">
                  <InventoriableToggle
                    categoryId={category.id}
                    initialValue={category.isExpense}
                    action={updateCategoryExpense}
                    label="Es gasto"
                  />
                </td>
                <td className="px-4 py-3 text-right">
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
