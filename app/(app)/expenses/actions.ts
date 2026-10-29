"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";

export type ExpenseState = { error?: string };

/**
 * Registra un gasto de operacion.
 *
 * Un gasto no es una compra: no tiene producto, ni unidad, ni cantidad, y no toca el almacen.
 * La renta, la luz y la nomina se capturaban antes inventando productos falsos que despues
 * ensuciaban el catalogo, el inventario y hasta los pedidos sugeridos.
 */
export async function createExpense(
  _prevState: ExpenseState | undefined,
  formData: FormData,
): Promise<ExpenseState> {
  try {
    const user = await requireSucursalContext();

    const dateRaw = String(formData.get("date") ?? "").trim();
    const productId = String(formData.get("productId") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
    const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
    const invoiceFolio = String(formData.get("invoiceFolio") ?? "").trim() || null;
    const comment = String(formData.get("comment") ?? "").trim() || null;

    if (!dateRaw) return { error: "Captura la fecha del gasto." };
    if (!productId) return { error: "Elige que se pago." };

    // El concepto no es texto libre: sale del catalogo, de una categoria marcada como gasto. Si
    // cada quien lo escribe a su manera, "LUZ", "Luz" y "CFE" terminan siendo tres cosas
    // distintas y ningun reporte las puede juntar.
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: user.organizationId },
      include: { category: { select: { isExpense: true } } },
    });
    if (!product) return { error: "Ese concepto no existe en tu catalogo." };
    if (!product.category?.isExpense) {
      return {
        error: `"${product.name}" no esta en una categoria marcada como gasto. Marcala en Configuracion > Categorias o elige otro concepto.`,
      };
    }

    const amount = new Decimal(String(formData.get("amount") ?? "0") || "0");
    if (amount.lte(0)) return { error: "El monto debe ser mayor a cero." };

    if (categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: categoryId, organizationId: user.organizationId },
      });
      if (!category) return { error: "Tipo de gasto no encontrado." };
    }
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, organizationId: user.organizationId },
      });
      if (!supplier) return { error: "Proveedor no encontrado." };
    }

    await prisma.expense.create({
      data: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        date: new Date(`${dateRaw}T00:00:00.000Z`),
        categoryId,
        supplierId,
        productId: product.id,
        // Se guarda el nombre tal como estaba hoy: renombrar el producto despues no debe
        // cambiar lo que dice un gasto de hace seis meses.
        concept: product.name,
        amount: amount.toString(),
        invoiceFolio,
        comment,
        createdByUserId: user.id,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar el gasto." };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  redirect("/expenses");
}

export async function deleteExpense(expenseId: string) {
  const user = await requireSucursalContext();

  const gasto = await prisma.expense.findFirst({
    where: { id: expenseId, sucursalId: user.sucursalId },
  });
  if (!gasto) throw new Error("Gasto no encontrado.");

  await prisma.expense.delete({ where: { id: gasto.id } });

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}
