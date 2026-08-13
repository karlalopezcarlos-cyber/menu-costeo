import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import SaleTicketForm from "./SaleTicketForm";

export default async function NewSaleTicketPage() {
  const user = await requireSucursalContext();

  const recipes = await prisma.recipe.findMany({
    where: { sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sellingPrice: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Registrar venta</h1>
        <p className="text-sm text-neutral-500">Captura el ticket como en un mini punto de venta.</p>
      </div>

      {recipes.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Todavia no tienes platillos de menu. Marca una receta como &quot;platillo de menu&quot; para
          poder venderla aqui.
        </p>
      ) : (
        <SaleTicketForm
          recipes={recipes.map((r) => ({
            id: r.id,
            name: r.name,
            sellingPrice: r.sellingPrice ? r.sellingPrice.toString() : null,
          }))}
        />
      )}
    </div>
  );
}
