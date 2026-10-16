"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

/**
 * Guarda el proveedor habitual de varios productos de un jalon.
 *
 * Esta pantalla existe para poder dejar amarrado el catalogo completo en una sola sentada, en vez
 * de entrar producto por producto. Solo se escriben los que de verdad cambiaron: con un catalogo
 * de cientos de productos, mandar todas las filas a la base en cada guardado es trabajo inutil.
 */
export async function saveDefaultSuppliers(formData: FormData) {
  const user = await requireOrgSession();

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      select: { id: true, defaultSupplierId: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    }),
  ]);
  const actualPorProducto = new Map(products.map((p) => [p.id, p.defaultSupplierId]));
  const proveedoresValidos = new Set(suppliers.map((s) => s.id));

  // Un cambio por proveedor destino: en vez de un update por producto, se agrupan los productos
  // que van al mismo proveedor y se mandan con updateMany.
  const porProveedor = new Map<string | null, string[]>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("supplier:")) continue;
    const productId = key.slice("supplier:".length);
    if (!actualPorProducto.has(productId)) continue;

    const valor = String(rawValue).trim();
    const nuevo = valor || null;
    if (nuevo && !proveedoresValidos.has(nuevo)) continue;
    if (actualPorProducto.get(productId) === nuevo) continue;

    const lista = porProveedor.get(nuevo) ?? [];
    lista.push(productId);
    porProveedor.set(nuevo, lista);
  }

  for (const [defaultSupplierId, productIds] of porProveedor) {
    await prisma.product.updateMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
      data: { defaultSupplierId },
    });
  }

  revalidatePath("/products");
  revalidatePath("/products/suppliers");
  revalidatePath("/orders/new");
}
