"use server";

import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { formatStoreOrderFolio } from "@/lib/store/folio";
import { createPaymentPreference } from "@/lib/mercadopago";
import { geocodeAddress, getDrivingDistanceKm, reverseGeocodeAddress, suggestAddress, type AddressSuggestion } from "@/lib/mapbox";
import { earliestAllowedDeliveryDate, generateDeliverySlots } from "@/lib/store/delivery-slots";

type StoreOrderRowInput = { recipeId: string; quantity: string };

type SucursalDeliveryConfig = { deliveryMaxKm: unknown };

/** Si la sucursal configuro un radio maximo de envio (> 0 km), rechaza distancias mayores. */
function assertWithinDeliveryRadius(sucursal: SucursalDeliveryConfig, distanceKm: number) {
  const maxKm = Number(sucursal.deliveryMaxKm);
  if (maxKm > 0 && distanceKm > maxKm) {
    throw new Error(
      `Tu ubicacion esta a ${distanceKm.toFixed(1)} km, fuera de nuestro rango de envio (maximo ${maxKm} km).`,
    );
  }
}

export type CreateStoreOrderState = { error?: string; folioLabel?: string; paymentLink?: string };

/**
 * Publico (sin autenticacion): lo llama un cliente externo desde /store/[slug]. Todo lo que llega
 * aqui se valida contra la base de datos (no se confia en nada del formulario mas que los IDs) --
 * el precio SIEMPRE se toma del recipe.sellingPrice vigente en el servidor, nunca de lo que mande
 * el cliente.
 */
export async function createStoreOrder(
  _prevState: CreateStoreOrderState | undefined,
  formData: FormData,
): Promise<CreateStoreOrderState> {
  try {
    const slug = String(formData.get("slug") ?? "").trim();
    const customerName = String(formData.get("customerName") ?? "").trim();
    const customerPhone = String(formData.get("customerPhone") ?? "").trim();
    const rowsRaw = String(formData.get("rows") ?? "[]");
    const paymentMethod = String(formData.get("paymentMethod") ?? "pickup_cash").trim();
    const fulfillmentType = String(formData.get("fulfillmentType") ?? "pickup").trim();
    const deliveryAddressInput = String(formData.get("deliveryAddress") ?? "").trim();
    const deliveryLatInput = String(formData.get("deliveryLat") ?? "").trim();
    const deliveryLngInput = String(formData.get("deliveryLng") ?? "").trim();
    const requestedDeliveryDateRaw = String(formData.get("requestedDeliveryDate") ?? "").trim();
    const requestedDeliveryTimeRaw = String(formData.get("requestedDeliveryTime") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;
    const packagingNotes = String(formData.get("packagingNotes") ?? "").trim() || null;
    // El origen (protocolo+dominio) lo manda el navegador del cliente (window.location.origin), ya
    // que un server action no tiene forma confiable de saber en que dominio se sirvio la pagina.
    const origin = String(formData.get("origin") ?? "").trim().replace(/\/$/, "");

    if (!slug) throw new Error("Tienda no encontrada.");
    if (!customerName) throw new Error("Indica tu nombre.");
    if (!customerPhone) throw new Error("Indica tu numero de telefono.");
    if (paymentMethod !== "pickup_cash" && paymentMethod !== "card_online") {
      throw new Error("Metodo de pago invalido.");
    }
    if (fulfillmentType !== "pickup" && fulfillmentType !== "delivery") {
      throw new Error("Tipo de entrega invalido.");
    }

    let rows: StoreOrderRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de pedido invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Tu carrito esta vacio.");
    }

    const sucursal = await prisma.sucursal.findFirst({
      where: { storeSlug: slug, storeEnabled: true },
    });
    if (!sucursal) throw new Error("Esta tienda no esta disponible ahorita.");

    const recipeIds = [...new Set(rows.map((r) => r.recipeId))];
    const recipes = await prisma.recipe.findMany({
      where: {
        id: { in: recipeIds },
        sucursalId: sucursal.id,
        isMenuItem: true,
        archivedAt: null,
        sellingPrice: { not: null },
      },
    });
    const recipeById = new Map(recipes.map((r) => [r.id, r]));

    const items = rows.map((row, index) => {
      const recipe = recipeById.get(row.recipeId);
      if (!recipe) throw new Error(`Uno de los platillos ya no esta disponible (fila ${index + 1}).`);
      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) throw new Error(`La cantidad de "${recipe.name}" debe ser mayor a cero.`);
      const unitPrice = new Decimal(recipe.sellingPrice!);
      return { recipeId: recipe.id, name: recipe.name, quantity, unitPrice };
    });

    const subtotal = items.reduce((sum, item) => sum.plus(item.quantity.times(item.unitPrice)), new Decimal(0));

    // El calendario (dia + horario) aplica igual para recoger en tienda que para domicilio -- ambos
    // son pedidos programados sobre el mismo calendario que configura el dueno, asi que esta parte
    // se valida siempre, no solo cuando fulfillmentType es "delivery".
    let requestedDeliveryDate: Date | null = null;
    let requestedDeliveryTime: string | null = null;

    if (!requestedDeliveryDateRaw) throw new Error("Elige un dia para tu pedido.");
    requestedDeliveryDate = new Date(`${requestedDeliveryDateRaw}T00:00:00Z`);

    // Nunca se confia en que el calendario del cliente ya filtro por anticipacion -- se vuelve a
    // exigir aqui, del lado del servidor.
    if (sucursal.deliveryLeadDays > 0 && requestedDeliveryDate < earliestAllowedDeliveryDate(sucursal.deliveryLeadDays)) {
      throw new Error(`Los pedidos necesitan al menos ${sucursal.deliveryLeadDays} dias de anticipacion.`);
    }

    const allowedDate = await prisma.storeDeliveryDate.findUnique({
      where: { sucursalId_date: { sucursalId: sucursal.id, date: requestedDeliveryDate } },
    });
    if (!allowedDate) throw new Error("Ese dia ya no esta disponible, elige otro.");

    if (sucursal.deliverySlotsCount > 0) {
      const validSlots = generateDeliverySlots(
        sucursal.deliveryStartTime ?? "",
        sucursal.deliverySlotMinutes,
        sucursal.deliverySlotsCount,
      );
      if (!requestedDeliveryTimeRaw || !validSlots.includes(requestedDeliveryTimeRaw)) {
        throw new Error("Elige un horario valido.");
      }
      // Se recuenta aqui mismo, justo antes de crear el pedido, para no confiar en la
      // disponibilidad que se le mostro al cliente cuando entro al checkout (pudo haberse llenado
      // el horario mientras tanto). El cupo se comparte entre pedidos de domicilio y de recoger en
      // tienda para el mismo dia/horario.
      const takenCount = await prisma.storeOrder.count({
        where: {
          sucursalId: sucursal.id,
          requestedDeliveryDate,
          requestedDeliveryTime: requestedDeliveryTimeRaw,
          status: { not: "cancelled" },
        },
      });
      if (takenCount >= sucursal.deliverySlotCapacity) {
        throw new Error("Ese horario ya se lleno, elige otro.");
      }
      requestedDeliveryTime = requestedDeliveryTimeRaw;
    }

    // Todo lo de envio se vuelve a calcular aqui, del lado del servidor -- nunca se confia en la
    // distancia/costo que ya se le habia mostrado al cliente en el checkout.
    let deliveryFee = new Decimal(0);
    let deliveryAddress: string | null = null;
    let deliveryLat: string | null = null;
    let deliveryLng: string | null = null;
    let deliveryDistanceKm: string | null = null;

    if (fulfillmentType === "delivery") {
      if (!deliveryAddressInput) throw new Error("Escribe tu direccion de entrega.");
      if (!sucursal.businessLat || !sucursal.businessLng) {
        throw new Error("Esta tienda todavia no tiene configurado el envio a domicilio.");
      }
      if (subtotal.lt(sucursal.deliveryMinOrder)) {
        throw new Error(`El pedido minimo para envio a domicilio es de $${sucursal.deliveryMinOrder}.`);
      }

      // Si el cliente ajusto el pin en el mapa se usan esas coordenadas exactas (mas precisas que
      // geocodificar el texto); si no, se cae al geocodificado del texto como antes.
      let pinLat = Number(deliveryLatInput);
      let pinLng = Number(deliveryLngInput);
      let placeLabel = deliveryAddressInput;
      if (!deliveryLatInput || !deliveryLngInput || Number.isNaN(pinLat) || Number.isNaN(pinLng)) {
        const geocoded = await geocodeAddress(deliveryAddressInput);
        if (!geocoded) throw new Error("No pudimos ubicar tu direccion. Intenta con mas detalle.");
        pinLat = geocoded.lat;
        pinLng = geocoded.lng;
        placeLabel = geocoded.placeName;
      }

      const distanceKm = await getDrivingDistanceKm(
        Number(sucursal.businessLat),
        Number(sucursal.businessLng),
        pinLat,
        pinLng,
      );
      assertWithinDeliveryRadius(sucursal, distanceKm);

      deliveryFee = new Decimal(sucursal.deliveryBaseFee).plus(new Decimal(sucursal.deliveryPricePerKm).times(distanceKm));
      deliveryAddress = placeLabel;
      deliveryLat = pinLat.toString();
      deliveryLng = pinLng.toString();
      deliveryDistanceKm = distanceKm.toString();
    }

    const total = subtotal.plus(deliveryFee);

    const { orderId, folio } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: sucursal.organizationId },
        data: { nextStoreOrderFolio: { increment: 1 } },
        select: { nextStoreOrderFolio: true },
      });
      const assignedFolio = org.nextStoreOrderFolio - 1;

      const order = await tx.storeOrder.create({
        data: {
          organizationId: sucursal.organizationId,
          sucursalId: sucursal.id,
          folio: assignedFolio,
          customerName,
          customerPhone,
          fulfillmentType,
          total: total.toString(),
          paymentMethod,
          paymentStatus: paymentMethod === "card_online" ? "pending" : "unpaid",
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          deliveryDistanceKm,
          deliveryFee: deliveryFee.toString(),
          requestedDeliveryDate,
          requestedDeliveryTime,
          comment,
          packagingNotes,
          items: {
            create: items.map((item) => ({
              recipeId: item.recipeId,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
            })),
          },
        },
      });

      return { orderId: order.id, folio: assignedFolio };
    });

    const folioLabel = formatStoreOrderFolio(folio);

    if (paymentMethod !== "card_online") {
      return { folioLabel };
    }

    // El pedido ya quedo registrado (folio asignado) antes de intentar generar el link de pago; si
    // Mercado Pago falla aqui, el pedido sigue existiendo como "pending" de pago para que el staff
    // lo pueda resolver manualmente desde Pedidos en linea, en vez de perderse.
    const paymentItems = [
      ...items.map((item) => ({ title: item.name, quantity: item.quantity.toNumber(), unitPrice: item.unitPrice.toNumber() })),
      ...(deliveryFee.gt(0) ? [{ title: "Envio a domicilio", quantity: 1, unitPrice: deliveryFee.toNumber() }] : []),
    ];
    const { preferenceId, paymentLink } = await createPaymentPreference(
      orderId,
      paymentItems,
      {
        notificationUrl: origin ? `${origin}/api/store/webhook/mercadopago` : undefined,
        backUrls: origin
          ? {
              success: `${origin}/store/${slug}/gracias?order=${orderId}`,
              pending: `${origin}/store/${slug}/gracias?order=${orderId}`,
              failure: `${origin}/store/${slug}?pago=fallido`,
            }
          : undefined,
      },
    );

    await prisma.storeOrder.update({
      where: { id: orderId },
      data: { paymentLink, paymentPreferenceId: preferenceId },
    });

    return { folioLabel, paymentLink };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo enviar tu pedido." };
  }
}

export type DeliveryFeeState = {
  error?: string;
  distanceKm?: number;
  fee?: number;
  placeName?: string;
  lat?: number;
  lng?: number;
};

/**
 * Sugerencias de autocompletado mientras el cliente escribe su direccion de entrega, para que las
 * elija de una lista en vez de tener que escribir la direccion completa y exacta.
 */
export async function suggestDeliveryAddress(query: string): Promise<AddressSuggestion[]> {
  try {
    return await suggestAddress(query);
  } catch {
    return [];
  }
}

/**
 * Calcula (sin guardar nada todavia) cuanto costaria el envio a una direccion, para mostrarlo en el
 * checkout antes de confirmar el pedido. El calculo real que se cobra se vuelve a hacer server-side
 * en createStoreOrder -- este resultado es solo una vista previa, nunca se confia en el. Tambien
 * regresa lat/lng para centrar el pin arrastrable del mapa.
 */
export async function calculateDeliveryFee(slug: string, address: string): Promise<DeliveryFeeState> {
  try {
    if (!address.trim()) throw new Error("Escribe tu direccion.");

    const sucursal = await prisma.sucursal.findFirst({ where: { storeSlug: slug, storeEnabled: true } });
    if (!sucursal) throw new Error("Tienda no encontrada.");
    if (!sucursal.businessLat || !sucursal.businessLng) {
      throw new Error("Esta tienda todavia no tiene configurado su punto de partida para envios.");
    }

    const geocoded = await geocodeAddress(address);
    if (!geocoded) throw new Error("No pudimos ubicar esa direccion. Intenta con mas detalle.");

    const distanceKm = await getDrivingDistanceKm(
      Number(sucursal.businessLat),
      Number(sucursal.businessLng),
      geocoded.lat,
      geocoded.lng,
    );
    assertWithinDeliveryRadius(sucursal, distanceKm);
    const fee = Number(sucursal.deliveryBaseFee) + Number(sucursal.deliveryPricePerKm) * distanceKm;

    return { distanceKm, fee, placeName: geocoded.placeName, lat: geocoded.lat, lng: geocoded.lng };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo calcular el envio." };
  }
}

/**
 * Igual que calculateDeliveryFee, pero a partir de coordenadas exactas (cuando el cliente ya
 * arrastro el pin en el mapa) en vez de re-geocodificar el texto -- se llama en cada drag del pin
 * para refrescar el costo/distancia sin perder precision.
 */
export async function calculateDeliveryFeeFromCoords(slug: string, lat: number, lng: number): Promise<DeliveryFeeState> {
  try {
    const sucursal = await prisma.sucursal.findFirst({ where: { storeSlug: slug, storeEnabled: true } });
    if (!sucursal) throw new Error("Tienda no encontrada.");
    if (!sucursal.businessLat || !sucursal.businessLng) {
      throw new Error("Esta tienda todavia no tiene configurado su punto de partida para envios.");
    }

    const distanceKm = await getDrivingDistanceKm(Number(sucursal.businessLat), Number(sucursal.businessLng), lat, lng);
    assertWithinDeliveryRadius(sucursal, distanceKm);
    const fee = Number(sucursal.deliveryBaseFee) + Number(sucursal.deliveryPricePerKm) * distanceKm;

    // Geocodificacion inversa para que el campo de direccion se actualice solo al mover el pin, en
    // vez de dejar el texto que el cliente escribio (o ninguno) desalineado del punto exacto.
    const reverseGeocoded = await reverseGeocodeAddress(lat, lng).catch(() => null);

    return { distanceKm, fee, lat, lng, placeName: reverseGeocoded?.placeName };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo calcular el envio." };
  }
}

export type DeliverySlotOption = { time: string; available: boolean };

/**
 * Horarios de entrega para una fecha, marcando cuales ya se llenaron (cupo agotado). Si la
 * sucursal no tiene horarios configurados (deliverySlotsCount = 0), regresa una lista vacia.
 */
export async function getAvailableDeliverySlots(slug: string, dateStr: string): Promise<DeliverySlotOption[]> {
  const sucursal = await prisma.sucursal.findFirst({ where: { storeSlug: slug, storeEnabled: true } });
  if (!sucursal || sucursal.deliverySlotsCount === 0 || !dateStr) return [];

  const slots = generateDeliverySlots(sucursal.deliveryStartTime ?? "", sucursal.deliverySlotMinutes, sucursal.deliverySlotsCount);
  if (slots.length === 0) return [];

  const date = new Date(`${dateStr}T00:00:00Z`);
  const counts = await prisma.storeOrder.groupBy({
    by: ["requestedDeliveryTime"],
    where: { sucursalId: sucursal.id, requestedDeliveryDate: date, status: { not: "cancelled" } },
    _count: { requestedDeliveryTime: true },
  });
  const countByTime = new Map(counts.map((c) => [c.requestedDeliveryTime, c._count.requestedDeliveryTime]));

  return slots.map((time) => ({
    time,
    available: (countByTime.get(time) ?? 0) < sucursal.deliverySlotCapacity,
  }));
}

export type RetryPaymentState = { error?: string; paymentLink?: string };

/**
 * Genera un nuevo link de pago para un pedido que ya existe (ej. el intento anterior fallo o
 * expiro), sin obligar al cliente a rehacer todo su carrito. Publico, igual que createStoreOrder.
 */
export async function retryStoreOrderPayment(orderId: string, origin: string): Promise<RetryPaymentState> {
  try {
    const order = await prisma.storeOrder.findFirst({
      where: { id: orderId },
      include: {
        items: { include: { recipe: { select: { name: true } } } },
        sucursal: { select: { storeSlug: true } },
      },
    });
    if (!order) throw new Error("Pedido no encontrado.");
    if (order.paymentStatus === "paid") throw new Error("Este pedido ya esta pagado.");

    const cleanOrigin = origin.trim().replace(/\/$/, "");
    const { preferenceId, paymentLink } = await createPaymentPreference(
      order.id,
      order.items.map((item) => ({
        title: item.recipe.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      {
        notificationUrl: cleanOrigin ? `${cleanOrigin}/api/store/webhook/mercadopago` : undefined,
        backUrls: cleanOrigin
          ? {
              success: `${cleanOrigin}/store/${order.sucursal.storeSlug}/gracias?order=${order.id}`,
              pending: `${cleanOrigin}/store/${order.sucursal.storeSlug}/gracias?order=${order.id}`,
              failure: `${cleanOrigin}/store/${order.sucursal.storeSlug}?pago=fallido`,
            }
          : undefined,
      },
    );

    await prisma.storeOrder.update({
      where: { id: order.id },
      data: { paymentLink, paymentPreferenceId: preferenceId, paymentStatus: "pending" },
    });

    return { paymentLink };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo generar un nuevo link de pago." };
  }
}
