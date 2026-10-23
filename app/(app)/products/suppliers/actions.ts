"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";

/**
 * Guarda el proveedor habitual y la categoria de varios productos de un jalon.
 *
 * Esta pantalla existe para poder acomodar el catalogo completo en una sola sentada, en vez de
 * entrar producto por producto. Solo se escriben los que de verdad cambiaron: con un catalogo de
 * cientos de productos, mandar todas las filas a la base en cada guardado es trabajo inutil.
 */
export async function saveDefaultSuppliers(formData: FormData) {
  const user = await requireOrgSession();

  const [products, suppliers, categories] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: user.organizationId, archivedAt: null },
      select: { id: true, defaultSupplierId: true, categoryId: true },
    }),
    prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    }),
    prisma.productCategory.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    }),
  ]);
  const actualPorProducto = new Map(products.map((p) => [p.id, p.defaultSupplierId]));
  const categoriaPorProducto = new Map(products.map((p) => [p.id, p.categoryId]));
  const proveedoresValidos = new Set(suppliers.map((s) => s.id));
  const categoriasValidas = new Set(categories.map((c) => c.id));

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

  // Lo mismo con la categoria: un updateMany por categoria destino en vez de uno por producto.
  const porCategoria = new Map<string | null, string[]>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("category:")) continue;
    const productId = key.slice("category:".length);
    if (!categoriaPorProducto.has(productId)) continue;

    const valor = String(rawValue).trim();
    const nueva = valor || null;
    if (nueva && !categoriasValidas.has(nueva)) continue;
    if (categoriaPorProducto.get(productId) === nueva) continue;

    const lista = porCategoria.get(nueva) ?? [];
    lista.push(productId);
    porCategoria.set(nueva, lista);
  }

  for (const [defaultSupplierId, productIds] of porProveedor) {
    await prisma.product.updateMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
      data: { defaultSupplierId },
    });
  }

  for (const [categoryId, productIds] of porCategoria) {
    await prisma.product.updateMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
      data: { categoryId },
    });
  }

  revalidatePath("/products");
  revalidatePath("/products/suppliers");
  revalidatePath("/orders/new");
  revalidatePath("/inventory");
}
