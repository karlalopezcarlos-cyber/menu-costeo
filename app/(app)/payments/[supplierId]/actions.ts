"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { formatMoney } from "@/lib/format";

async function requireSupplier(organizationId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, organizationId } });
  if (!supplier) throw new Error("Proveedor no encontrado.");
  return supplier;
}

function parseFolios(raw: string): number[] {
  return raw
    .split(",")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
}

async function folioTotals(organizationId: string, supplierId: string, folio: number) {
  const [purchaseAgg, paymentAgg] = await Promise.all([
    prisma.purchase.aggregate({
      where: { organizationId, supplierId, folio },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { organizationId, supplierId, folio },
      _sum: { amount: true },
    }),
  ]);
  const total = new Decimal(purchaseAgg._sum.totalPrice ?? 0);
  const abonado = new Decimal(paymentAgg._sum.amount ?? 0);
  return { total, abonado, remaining: total.minus(abonado) };
}

/** Total y saldo pendiente de varios folios a la vez (para liquidar en bloque sin N+1). */
async function folioTotalsMany(organizationId: string, supplierId: string, folios: number[]) {
  const [purchaseGroups, paymentGroups] = await Promise.all([
    prisma.purchase.groupBy({
      by: ["folio"],
      where: { organizationId, supplierId, folio: { in: folios } },
      _sum: { totalPrice: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["folio"],
      where: { organizationId, supplierId, folio: { in: folios } },
      _sum: { amount: true },
    }),
  ]);
  const totalByFolio = new Map(purchaseGroups.map((g) => [g.folio, new Decimal(g._sum.totalPrice ?? 0)]));
  const paidByFolio = new Map(
    paymentGroups.filter((g) => g.folio !== null).map((g) => [g.folio as number, new Decimal(g._sum.amount ?? 0)]),
  );
  return folios.map((folio) => {
    const total = totalByFolio.get(folio) ?? new Decimal(0);
    const abonado = paidByFolio.get(folio) ?? new Decimal(0);
    return { folio, total, abonado, remaining: total.minus(abonado) };
  });
}

/** Abono parcial (o total, si el monto cubre lo que falta) a un folio especifico. */
export async function addFolioPayment(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();
    const supplierId = String(formData.get("supplierId") ?? "");
    const folio = Number(formData.get("folio"));
    const amountRaw = String(formData.get("amount") ?? "");
    const paidDateRaw = String(formData.get("paidDate") ?? "");
    if (!supplierId || !Number.isInteger(folio) || !paidDateRaw) {
      throw new Error("Datos invalidos.");
    }
    await requireSupplier(user.organizationId, supplierId);

    const amount = new Decimal(amountRaw || "0");
    if (amount.lte(0)) throw new Error("El abono debe ser mayor a cero.");

    const { remaining } = await folioTotals(user.organizationId, supplierId, folio);
    if (remaining.lte(0)) throw new Error("Ese folio ya esta completamente pagado.");
    if (amount.gt(remaining)) {
      throw new Error(`El abono no puede ser mayor al saldo pendiente de este folio (${formatMoney(remaining.toNumber())}).`);
    }

    await prisma.supplierPayment.create({
      data: {
        organizationId: user.organizationId,
        supplierId,
        folio,
        amount: amount.toString(),
        paidDate: new Date(`${paidDateRaw}T00:00:00.000Z`),
        createdByUserId: user.id,
      },
    });

    revalidatePath(`/payments/${supplierId}`);
    revalidatePath("/payments");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar el abono." };
  }
}

/**
 * Liquida de un jalon lo que falte de uno o varios folios (equivalente a marcarlos "Pagado").
 * Se usa tanto para el checkbox individual como para "Pagar todo lo seleccionado".
 */
export async function settleFolios(formData: FormData) {
  const user = await requireOrgSession();
  const supplierId = String(formData.get("supplierId") ?? "");
  const folios = parseFolios(String(formData.get("folios") ?? ""));
  const paidDateRaw = String(formData.get("paidDate") ?? "");
  if (!supplierId || folios.length === 0 || !paidDateRaw) throw new Error("Datos invalidos.");
  await requireSupplier(user.organizationId, supplierId);

  const totals = await folioTotalsMany(user.organizationId, supplierId, folios);
  const paidDate = new Date(`${paidDateRaw}T00:00:00.000Z`);
  const toCreate = totals.filter((t) => t.remaining.gt(0));
  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((t) =>
        prisma.supplierPayment.create({
          data: {
            organizationId: user.organizationId,
            supplierId,
            folio: t.folio,
            amount: t.remaining.toString(),
            paidDate,
            createdByUserId: user.id,
          },
        }),
      ),
    );
  }

  revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
}

/** Deshace todos los abonos de uno o varios folios (equivalente a desmarcar "Pagado"). */
export async function resetFolios(formData: FormData) {
  const user = await requireOrgSession();
  const supplierId = String(formData.get("supplierId") ?? "");
  const folios = parseFolios(String(formData.get("folios") ?? ""));
  if (!supplierId || folios.length === 0) throw new Error("Datos invalidos.");
  await requireSupplier(user.organizationId, supplierId);

  await prisma.supplierPayment.deleteMany({
    where: { organizationId: user.organizationId, supplierId, folio: { in: folios } },
  });

  revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
}

/** Elimina un abono antiguo sin folio asociado (ya no se pueden crear nuevos asi). */
export async function deleteAdvancePayment(formData: FormData) {
  const user = await requireOrgSession();
  const id = String(formData.get("id") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  if (!id || !supplierId) throw new Error("Datos invalidos.");

  await prisma.supplierPayment.deleteMany({
    where: { id, organizationId: user.organizationId, supplierId, folio: null },
  });

  revalidatePath(`/payments/${supplierId}`);
  revalidatePath("/payments");
}
