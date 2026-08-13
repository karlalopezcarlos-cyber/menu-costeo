"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { createPaymentPreference } from "@/lib/mercadopago";

export async function upsertDailySale(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();

    const recipeId = String(formData.get("recipeId") ?? "");
    const dateRaw = String(formData.get("date") ?? "");
    const quantitySold = new Decimal(String(formData.get("quantitySold") ?? "0"));
    const unitPrice = new Decimal(String(formData.get("unitPrice") ?? "0"));

    if (!recipeId) throw new Error("Selecciona un platillo.");
    if (!dateRaw) throw new Error("Indica la fecha de la venta.");
    if (quantitySold.lt(0)) throw new Error("La cantidad no puede ser negativa.");
    if (unitPrice.lt(0)) throw new Error("El precio no puede ser negativo.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, sucursalId: user.sucursalId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const date = new Date(`${dateRaw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

    await prisma.dailySale.upsert({
      where: {
        organizationId_recipeId_date: { organizationId: user.organizationId, recipeId: recipe.id, date },
      },
      create: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        recipeId: recipe.id,
        date,
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
      update: {
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la venta." };
  }

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  return {};
}

export async function updateDailySale(
  saleId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();

    const sale = await prisma.dailySale.findFirst({
      where: { id: saleId, sucursalId: user.sucursalId },
    });
    if (!sale) throw new Error("Venta no encontrada.");

    const recipeId = String(formData.get("recipeId") ?? "");
    const dateRaw = String(formData.get("date") ?? "");
    const quantitySold = new Decimal(String(formData.get("quantitySold") ?? "0"));
    const unitPrice = new Decimal(String(formData.get("unitPrice") ?? "0"));

    if (!recipeId) throw new Error("Selecciona un platillo.");
    if (!dateRaw) throw new Error("Indica la fecha de la venta.");
    if (quantitySold.lt(0)) throw new Error("La cantidad no puede ser negativa.");
    if (unitPrice.lt(0)) throw new Error("El precio no puede ser negativo.");

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, sucursalId: user.sucursalId },
    });
    if (!recipe) throw new Error("Receta no encontrada.");

    const date = new Date(`${dateRaw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

    // Si cambiaron la fecha o el platillo, nos aseguramos de no chocar con otra venta ya
    // existente para esa combinacion (en vez de sobreescribirla en silencio).
    if (recipeId !== sale.recipeId || date.getTime() !== sale.date.getTime()) {
      const conflict = await prisma.dailySale.findFirst({
        where: { sucursalId: user.sucursalId, recipeId, date, id: { not: sale.id } },
      });
      if (conflict) {
        throw new Error("Ya existe una venta de ese platillo en esa fecha; edita esa fila en su lugar.");
      }
    }

    await prisma.dailySale.update({
      where: { id: sale.id },
      data: {
        recipeId,
        date,
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo actualizar la venta." };
  }

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  return {};
}

export async function deleteDailySale(saleId: string): Promise<void> {
  const user = await requireSucursalContext();
  const sale = await prisma.dailySale.findFirst({
    where: { id: saleId, sucursalId: user.sucursalId },
  });
  if (!sale) throw new Error("Venta no encontrada.");

  await prisma.dailySale.delete({ where: { id: sale.id } });

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
}

type SaleTicketRowInput = {
  recipeId: string;
  quantity: string;
  unitPrice: string;
};

export async function createSaleTicket(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  let ticketId: string | null = null;
  try {
    const user = await requireSucursalContext();

    const saleDateRaw = String(formData.get("saleDate") ?? "");
    const rowsRaw = String(formData.get("rows") ?? "[]");

    if (!saleDateRaw) throw new Error("Indica la fecha de la venta.");

    let rows: SaleTicketRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de venta invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un platillo.");
    }

    const recipeIds = [...new Set(rows.map((r) => r.recipeId))];
    const recipes = await prisma.recipe.findMany({
      where: { id: { in: recipeIds }, sucursalId: user.sucursalId, isMenuItem: true, archivedAt: null },
    });
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    const saleDate = new Date(`${saleDateRaw}T00:00:00Z`);
    if (Number.isNaN(saleDate.getTime())) throw new Error("Fecha invalida.");

    const items = rows.map((row, index) => {
      const recipe = recipeById.get(row.recipeId);
      if (!recipe) throw new Error(`Selecciona un platillo valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) throw new Error(`La cantidad de "${recipe.name}" debe ser mayor a cero.`);

      const unitPrice = new Decimal(row.unitPrice || "0");
      if (unitPrice.lt(0)) throw new Error(`El precio de "${recipe.name}" no puede ser negativo.`);

      return { recipe, quantity, unitPrice };
    });

    ticketId = await prisma.$transaction(async (tx) => {
      // Todos los platillos capturados en este ticket comparten un solo folio, igual que
      // Compras/Pedidos/Requisiciones/Produccion.
      const org = await tx.organization.update({
        where: { id: user.organizationId },
        data: { nextSaleFolio: { increment: 1 } },
        select: { nextSaleFolio: true },
      });
      const folio = org.nextSaleFolio - 1;

      const ticket = await tx.saleTicket.create({
        data: {
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          folio,
          date: saleDate,
          createdByUserId: user.id,
          items: {
            create: items.map((item) => ({
              recipeId: item.recipe.id,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
            })),
          },
        },
      });

      // Cada renglon del ticket tambien se suma al agregado diario existente (DailySale), del que
      // dependen Ingenieria de menu y Estado de Resultados, para que sigan funcionando sin cambios.
      // A diferencia de la captura manual (que sobreescribe), aqui se incrementa la cantidad y se
      // recalcula un precio promedio ponderado, para no perder precision si ya habia ventas del
      // mismo platillo ese dia (manuales, importadas o de otro ticket).
      for (const item of items) {
        const existing = await tx.dailySale.findUnique({
          where: {
            organizationId_recipeId_date: {
              organizationId: user.organizationId,
              recipeId: item.recipe.id,
              date: saleDate,
            },
          },
        });

        if (!existing) {
          await tx.dailySale.create({
            data: {
              organizationId: user.organizationId,
              sucursalId: user.sucursalId,
              recipeId: item.recipe.id,
              date: saleDate,
              quantitySold: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              source: "pos",
            },
          });
        } else {
          const prevQty = new Decimal(existing.quantitySold);
          const prevPrice = new Decimal(existing.unitPrice);
          const newQty = prevQty.plus(item.quantity);
          const newPrice = newQty.isZero()
            ? prevPrice
            : prevQty.times(prevPrice).plus(item.quantity.times(item.unitPrice)).dividedBy(newQty);

          await tx.dailySale.update({
            where: { id: existing.id },
            data: {
              quantitySold: newQty.toString(),
              unitPrice: newPrice.toString(),
              source: "pos",
            },
          });
        }
      }

      return ticket.id;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la venta." };
  }

  revalidatePath("/sales");
  revalidatePath("/sales/tickets");
  revalidatePath("/menu-engineering");
  redirect(`/sales/tickets/${ticketId}`);
}

export async function deleteSaleTicket(ticketId: string): Promise<void> {
  const user = await requireSucursalContext();

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.saleTicket.findFirst({
      where: { id: ticketId, sucursalId: user.sucursalId },
      include: { items: true },
    });
    if (!ticket) throw new Error("Ticket no encontrado.");

    // Al eliminar el ticket, revertimos su aportacion al agregado diario (DailySale) de cada
    // platillo: restamos la cantidad y recalculamos el precio promedio del resto, o borramos la
    // fila si el ticket era la unica venta de ese platillo ese dia.
    for (const item of ticket.items) {
      const existing = await tx.dailySale.findUnique({
        where: {
          organizationId_recipeId_date: {
            organizationId: user.organizationId,
            recipeId: item.recipeId,
            date: ticket.date,
          },
        },
      });
      if (!existing) continue;

      const prevQty = new Decimal(existing.quantitySold);
      const prevPrice = new Decimal(existing.unitPrice);
      const itemQty = new Decimal(item.quantity);
      const itemPrice = new Decimal(item.unitPrice);
      const remainingQty = prevQty.minus(itemQty);

      if (remainingQty.lte(0)) {
        await tx.dailySale.delete({ where: { id: existing.id } });
        continue;
      }

      // Reconstruye el precio promedio quitando la contribucion de este ticket de la suma
      // ponderada, en vez de recalcular desde cero (no tenemos el detalle de las demas fuentes).
      const remainingWeightedSum = prevQty.times(prevPrice).minus(itemQty.times(itemPrice));
      const remainingPrice = remainingWeightedSum.lte(0)
        ? prevPrice
        : remainingWeightedSum.dividedBy(remainingQty);

      await tx.dailySale.update({
        where: { id: existing.id },
        data: { quantitySold: remainingQty.toString(), unitPrice: remainingPrice.toString() },
      });
    }

    await tx.saleTicket.delete({ where: { id: ticket.id } });
  });

  revalidatePath("/sales");
  revalidatePath("/sales/tickets");
  revalidatePath("/menu-engineering");
}

export async function generateSaleTicketPaymentLink(
  ticketId: string,
): Promise<{ error?: string; paymentLink?: string }> {
  try {
    const user = await requireSucursalContext();

    const ticket = await prisma.saleTicket.findFirst({
      where: { id: ticketId, sucursalId: user.sucursalId },
      include: { items: { include: { recipe: true } } },
    });
    if (!ticket) throw new Error("Ticket no encontrado.");

    const { preferenceId, paymentLink } = await createPaymentPreference(
      ticket.id,
      ticket.items.map((item) => ({
        title: item.recipe.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    );

    await prisma.saleTicket.update({
      where: { id: ticket.id },
      data: { paymentLink, paymentPreferenceId: preferenceId },
    });

    revalidatePath(`/sales/tickets/${ticket.id}`);
    return { paymentLink };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo generar el link de pago." };
  }
}
