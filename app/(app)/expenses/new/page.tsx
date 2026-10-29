import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { listSuppliersForCapture } from "@/lib/suppliers";
import ExpenseForm from "./ExpenseForm";

export default async function NewExpensePage() {
  const user = await requireSucursalContext();

  const [categories, suppliers, conceptos] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    listSuppliersForCapture(user.organizationId),
    prisma.product.findMany({
      where: {
        organizationId: user.organizationId,
        archivedAt: null,
        category: { isExpense: true },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Registrar gasto</h1>
        <Link href="/expenses" className="text-sm text-neutral-500 hover:underline">
          Volver
        </Link>
      </div>
      <ExpenseForm
        categories={categories}
        suppliers={suppliers}
        conceptos={conceptos.map((p) => ({
          id: p.id,
          name: p.name,
          categoryName: p.category?.name ?? null,
        }))}
      />
    </div>
  );
}
