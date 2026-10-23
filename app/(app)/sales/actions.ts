"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { createPaymentPreference } from "@/lib/mercadopago";

type CambioDeVenta = {
  dailySaleId: string | null;
  recipeId: string;
  date: Date;
  action: "create" | "update" | "delete";
  previousQuantity?: Decimal | null;
  newQuantity?: Decimal | null;
  previousPrice?: Decimal | null;
  newPrice?: Decimal | null;
  source: string;
};

/**
 * Deja constancia de quien movio una venta y que decia antes.
 *
 * Una venta diaria se puede capturar a mano, llegar de un archivo o salir de un ticket, y
 * despues cualquiera con acceso puede corregirla. Sin esto, el numero cambiaba y no quedaba
 * rastro de quien ni de que habia antes, que es justo lo que se necesita cuando el costo de un
 * mes no cuadra.
 */
async function registrarCambioDeVenta(
  organizationId: string,
  sucursalId: string,
  userId: string | null,
  cambio: CambioDeVenta,
) {
  await prisma.dailySaleChange.create({
    data: {
      organizationId,
      sucursalId,
      dailySaleId: cambio.dailySaleId,
      recipeId: cambio.recipeId,
      date: cambio.date,
      action: cambio.action,
      previousQuantity: cambio.previousQuantity?.toString() ?? null,
      newQuantity: cambio.newQuantity?.toString() ?? null,
      previousPrice: cambio.previousPrice?.toString() ?? null,
      newPrice: cambio.newPrice?.toString() ?? null,
      source: cambio.source,
      changedByUserId: userId,
    },
  });
}

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

    // Lo que habia antes se lee primero: es lo unico que permite contar la correccion en la
    // bitacora ("pasaron 10 a 12"), no solo el valor final.
    const anterior = await prisma.dailySale.findUnique({
      where: {
        organizationId_recipeId_date: { organizationId: user.organizationId, recipeId: recipe.id, date },
      },
    });

    const venta = await prisma.dailySale.upsert({
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
        createdByUserId: user.id,
      },
      update: {
        quantitySold: quantitySold.toString(),
        unitPrice: unitPrice.toString(),
        source: "manual",
        createdByUserId: user.id,
      },
    });

    await registrarCambioDeVenta(user.organizationId, user.sucursalId, user.id, {
      dailySaleId: venta.id,
      recipeId: recipe.id,
      date,
      action: anterior ? "update" : "create",
      previousQuantity: anterior ? new Decimal(anterior.quantitySold.toString()) : null,
      newQuantity: quantitySold,
      previousPrice: anterior ? new Decimal(anterior.unitPrice.toString()) : null,
      newPrice: unitPrice,
      source: anterior?.source ?? "manual",
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
        createdByUserId: user.id,
      },
    });

    // Si venia de un archivo, sus renglones se retiran: mientras existan, cualquier recalculo de
    // las importadas devolveria la cantidad original y la correccion se perderia sin aviso. A
    // partir de esta edicion, la venta vale por si misma.
    if (sale.source === "import") {
      await prisma.importRow.deleteMany({
        where: {
          matchedRecipeId: sale.recipeId,
          date: sale.date,
          importBatch: { sucursalId: user.sucursalId },
        },
      });
    }

    await registrarCambioDeVenta(user.organizationId, user.sucursalId, user.id, {
      dailySaleId: sale.id,
      recipeId,
      date,
      action: "update",
      previousQuantity: new Decimal(sale.quantitySold.toString()),
      newQuantity: quantitySold,
      previousPrice: new Decimal(sale.unitPrice.toString()),
      newPrice: unitPrice,
      source: sale.source,
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

  // Si venia de un archivo, su renglon se va con ella: dejarlo haria reaparecer la venta en el
  // siguiente recalculo de las importadas.
  if (sale.source === "import") {
    await prisma.importRow.deleteMany({
      where: {
        matchedRecipeId: sale.recipeId,
        date: sale.date,
        importBatch: { sucursalId: user.sucursalId },
      },
    });
  }

  // La bitacora se escribe despues de borrar y a proposito no apunta a la venta (ya no existe):
  // por eso guarda la receta y la fecha, para poder decir que se borro y que decia.
  await registrarCambioDeVenta(user.organizationId, user.sucursalId, user.id, {
    dailySaleId: null,
    recipeId: sale.recipeId,
    date: sale.date,
    action: "delete",
    previousQuantity: new Decimal(sale.quantitySold.toString()),
    newQuantity: null,
    previousPrice: new Decimal(sale.unitPrice.toString()),
    newPrice: null,
    source: sale.source,
  });

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
              createdByUserId: user.id,
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
              createdByUserId: user.id,
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

/**
 * Borra de un jalon todas las ventas de un dia.
 *
 * Sirve para cuando un dia entero entro mal —una importacion con el archivo equivocado, por
 * ejemplo— y rehacerlo venta por venta seria absurdo. Se borran tambien los renglones importados
 * de ese dia: si se quedaran, el dia volveria a aparecer solo la proxima vez que algo recalcule
 * las ventas importadas.
 *
 * Los tickets de venta NO se tocan: tienen folio propio y su propia pantalla, y borrarlos de
 * refilon seria destruir un comprobante sin que nadie lo pidiera.
 */
export async function deleteSalesForDay(dateKey: string): Promise<{ borradas: number }> {
  const user = await requireSucursalContext();

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

  const ventas = await prisma.dailySale.findMany({
    where: { sucursalId: user.sucursalId, date },
    select: { id: true, recipeId: true, quantitySold: true, unitPrice: true, source: true },
  });
  if (ventas.length === 0) return { borradas: 0 };

  await prisma.dailySale.deleteMany({
    where: { id: { in: ventas.map((v) => v.id) } },
  });

  // Cada venta borrada deja su constancia: que decia y quien la borro.
  await prisma.dailySaleChange.createMany({
    data: ventas.map((venta) => ({
      organizationId: user.organizationId,
      sucursalId: user.sucursalId,
      dailySaleId: null,
      recipeId: venta.recipeId,
      date,
      action: "delete",
      previousQuantity: venta.quantitySold.toString(),
      previousPrice: venta.unitPrice.toString(),
      source: venta.source,
      changedByUserId: user.id,
    })),
  });

  await prisma.importRow.deleteMany({
    where: { date, importBatch: { sucursalId: user.sucursalId } },
  });

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  revalidatePath("/dashboard");

  return { borradas: ventas.length };
}

/**
 * Devuelve las ventas de un dia que se borraron, reconstruyendolas desde la bitacora.
 *
 * Cuando se borra un dia, cada venta deja registrada su cantidad y su precio. Eso no se guardo
 * pensando en esto, pero alcanza para devolverlas tal como estaban, y hace que un borrado
 * —que es facil de repetir de mas sin darse cuenta— deje de ser definitivo.
 *
 * Lo que no vuelve son los renglones del archivo original: la venta regresa valiendo por si
 * misma. Por eso queda como capturada a mano.
 */
export async function restoreDeletedDay(dateKey: string): Promise<{ restauradas: number }> {
  const user = await requireSucursalContext();

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha invalida.");

  const borradas = await prisma.dailySaleChange.findMany({
    where: { sucursalId: user.sucursalId, date, action: "delete" },
    orderBy: { createdAt: "desc" },
    select: { recipeId: true, previousQuantity: true, previousPrice: true, source: true },
  });
  if (borradas.length === 0) return { restauradas: 0 };

  // De un mismo platillo pudo borrarse mas de una vez; vale la ultima, que es como quedo.
  const porReceta = new Map<string, (typeof borradas)[number]>();
  for (const borrada of borradas) {
    if (!porReceta.has(borrada.recipeId)) porReceta.set(borrada.recipeId, borrada);
  }

  // No se pisa lo que ya exista: si despues del borrado alguien volvio a capturar ese dia, lo
  // suyo manda sobre lo que diga la bitacora.
  const existentes = await prisma.dailySale.findMany({
    where: { sucursalId: user.sucursalId, date },
    select: { recipeId: true },
  });
  const yaHay = new Set(existentes.map((v) => v.recipeId));

  const porCrear = [...porReceta.values()]
    .filter((v) => !yaHay.has(v.recipeId) && v.previousQuantity !== null)
    .map((v) => ({
      organizationId: user.organizationId,
      sucursalId: user.sucursalId,
      recipeId: v.recipeId,
      date,
      quantitySold: v.previousQuantity!.toString(),
      unitPrice: (v.previousPrice ?? 0).toString(),
      source: "manual",
      createdByUserId: user.id,
    }));

  if (porCrear.length === 0) return { restauradas: 0 };

  await prisma.dailySale.createMany({ data: porCrear, skipDuplicates: true });

  await prisma.dailySaleChange.createMany({
    data: porCrear.map((v) => ({
      organizationId: user.organizationId,
      sucursalId: user.sucursalId,
      dailySaleId: null,
      recipeId: v.recipeId,
      date,
      action: "create",
      newQuantity: v.quantitySold,
      newPrice: v.unitPrice,
      source: "manual",
      changedByUserId: user.id,
    })),
  });

  revalidatePath("/sales");
  revalidatePath("/menu-engineering");
  revalidatePath("/dashboard");

  return { restauradas: porCrear.length };
}
