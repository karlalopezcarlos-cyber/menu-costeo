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
    const concept = String(formData.get("concept") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
    const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
    const invoiceFolio = String(formData.get("invoiceFolio") ?? "").trim() || null;
    const comment = String(formData.get("comment") ?? "").trim() || null;

    if (!dateRaw) return { error: "Captura la fecha del gasto." };
    if (!concept) return { error: "Describe el gasto (ej. Renta de octubre, CFE)." };

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
        concept,
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
