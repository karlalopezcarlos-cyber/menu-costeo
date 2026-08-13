import { prisma } from "@/lib/prisma";

/**
 * Proveedores para un selector de captura (Compras/Pedidos nuevos): solo activos. Cuando se pasa
 * `includeSupplierId` (edicion de un registro ya existente), ese proveedor se incluye aunque este
 * inactivo, para no dejar el select sin la opcion ya asignada.
 */
export async function listSuppliersForCapture(organizationId: string, includeSupplierId?: string | null) {
  return prisma.supplier.findMany({
    where: {
      organizationId,
      ...(includeSupplierId ? { OR: [{ isActive: true }, { id: includeSupplierId }] } : { isActive: true }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
