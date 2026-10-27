import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import SettingsNav from "../SettingsNav";
import InlineNameEditor from "../InlineNameEditor";
import { createCostGroup, deleteCostGroup, moveCostGroup, renameCostGroup } from "./actions";
import MoveGroupButtons from "./MoveGroupButtons";

export default async function CostGroupsPage() {
  const user = await requireOrgSession();

  const groups = await prisma.costGroup.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { productCategories: true, recipeCategories: true } },
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/cost-groups" />
        <p className="mt-3 text-sm text-neutral-500">
          Como separa este negocio sus gastos en el Estado de Resultados. Cada grupo es una
          columna del reporte, en el orden que les des aqui. Un restaurante suele querer
          alimento y bebidas; una cafeteria, cafe y reposteria; una barra, cerveza y destilados
          por separado. Las categorias de productos y de recetas se asignan a estos grupos.
        </p>
      </div>

      <form action={createCostGroup} className="flex gap-2">
        <input
          name="name"
          required
          placeholder="Ej. Alimento, Bebidas, Desechables"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
        >
          Agregar
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Orden</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Grupo</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Categorias</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Sin grupos todavia: el Estado de Resultados saldria con una sola columna. Crea
                  los que uses para separar tus gastos.
                </td>
              </tr>
            )}
            {groups.map((group, index) => (
              <tr key={group.id} className="border-t border-neutral-100">
                <td className="px-4 py-3">
                  <MoveGroupButtons
                    costGroupId={group.id}
                    isFirst={index === 0}
                    isLast={index === groups.length - 1}
                    action={moveCostGroup}
                  />
                </td>
                <td className="px-4 py-3">
                  <InlineNameEditor id={group.id} initialName={group.name} action={renameCostGroup} />
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {group._count.productCategories + group._count.recipeCategories}
                </td>
                <td className="px-4 py-3 text-right">
                  <form
                    action={async () => {
                      "use server";
                      await deleteCostGroup(group.id);
                    }}
                  >
                    <button type="submit" className="text-xs text-neutral-400 hover:text-red-600">
                      Borrar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Borrar un grupo no borra sus categorias: quedan sin grupo y sus montos se juntan en una
        columna aparte del reporte hasta que las acomodes.
      </p>
    </div>
  );
}
