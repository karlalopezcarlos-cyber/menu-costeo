import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { listSuppliersForCapture } from "@/lib/suppliers";
import { getLatestPlanningRunView, getPendingStoreDemand } from "../actions";
import PlanningForm from "./PlanningForm";

export default async function PlanningByPluPage() {
  const user = await requireSucursalContext();

  const [recipes, suppliers, latestRun, pendingStoreDemand] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listSuppliersForCapture(user.organizationId),
    getLatestPlanningRunView(),
    getPendingStoreDemand(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Planeacion por PLU</h1>
        <p className="text-sm text-neutral-500">
          Elige cuanto planeas vender de cada platillo. Explotamos la receta (incluyendo subrecetas)
          y descontamos lo que ya tienes, para decirte que producir y que comprar.
        </p>
      </div>

      <PlanningForm
        recipes={recipes}
        suppliers={suppliers}
        initialRun={latestRun}
        pendingStoreDemand={pendingStoreDemand}
      />
    </div>
  );
}
