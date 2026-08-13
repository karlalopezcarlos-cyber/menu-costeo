"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { geocodeAddress, reverseGeocodeAddress, suggestAddress, type AddressSuggestion } from "@/lib/mapbox";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function updateStoreSettings(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") {
      throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");
    }

    const slugRaw = String(formData.get("storeSlug") ?? "").trim();
    const storeEnabled = formData.get("storeEnabled") === "on";

    const slug = slugify(slugRaw);
    if (storeEnabled && !slug) {
      throw new Error("Define un slug antes de habilitar la tienda.");
    }

    try {
      await prisma.sucursal.update({
        where: { id: user.sucursalId, organizationId: user.organizationId },
        data: { storeSlug: slug || null, storeEnabled },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        throw new Error(`El slug "${slug}" ya esta en uso por otra sucursal. Elige otro.`);
      }
      throw error;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la configuracion." };
  }

  revalidatePath("/settings/store");
  return { success: true };
}

export type GeocodePreviewState = { error?: string; lat?: number; lng?: number; placeName?: string };

/**
 * Sugerencias de autocompletado mientras el dueno escribe la direccion del negocio, para que la
 * elija de una lista en vez de tener que escribir la direccion completa y exacta.
 */
export async function suggestBusinessAddress(query: string): Promise<AddressSuggestion[]> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") return [];
    return await suggestAddress(query);
  } catch {
    return [];
  }
}

/**
 * Ubica una direccion en el mapa sin guardar nada todavia -- se usa para centrar el pin arrastrable
 * antes de que el dueno confirme la ubicacion exacta con "Guardar ubicacion".
 */
export async function previewBusinessAddress(address: string): Promise<GeocodePreviewState> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");
    if (!address.trim()) throw new Error("Escribe la direccion de tu negocio.");

    const geocoded = await geocodeAddress(address);
    if (!geocoded) throw new Error("No pudimos ubicar esa direccion. Intenta con mas detalle.");

    return { lat: geocoded.lat, lng: geocoded.lng, placeName: geocoded.placeName };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo ubicar esa direccion." };
  }
}

/**
 * Geocodificacion inversa: al arrastrar el pin en el mapa, actualiza el texto de la direccion para
 * que no se quede desalineado de la posicion exacta que se va a guardar.
 */
export async function previewLocationFromCoords(lat: number, lng: number): Promise<GeocodePreviewState> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");

    const reverseGeocoded = await reverseGeocodeAddress(lat, lng);
    if (!reverseGeocoded) throw new Error("No pudimos ubicar esa posicion.");

    return { lat, lng, placeName: reverseGeocoded.placeName };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo ubicar esa posicion." };
  }
}

export async function updateBusinessLocation(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");

    const address = String(formData.get("businessAddress") ?? "").trim();
    if (!address) throw new Error("Escribe la direccion de tu negocio.");

    const latRaw = String(formData.get("businessLat") ?? "").trim();
    const lngRaw = String(formData.get("businessLng") ?? "").trim();

    let lat: number;
    let lng: number;
    let placeName: string;

    // Si ya se ajusto el pin en el mapa se usa esa posicion exacta; si no, se cae al comportamiento
    // anterior de geocodificar el texto directo (para no romper a quien guarda sin usar el mapa).
    if (latRaw && lngRaw) {
      lat = Number(latRaw);
      lng = Number(lngRaw);
      placeName = address;
    } else {
      const geocoded = await geocodeAddress(address);
      if (!geocoded) throw new Error("No pudimos ubicar esa direccion. Intenta con mas detalle.");
      lat = geocoded.lat;
      lng = geocoded.lng;
      placeName = geocoded.placeName;
    }

    await prisma.sucursal.update({
      where: { id: user.sucursalId, organizationId: user.organizationId },
      data: {
        businessAddress: placeName,
        businessLat: lat.toString(),
        businessLng: lng.toString(),
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la ubicacion." };
  }

  revalidatePath("/settings/store");
  return { success: true };
}

export async function updateDeliveryPricing(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");

    const baseFee = new Decimal(String(formData.get("deliveryBaseFee") ?? "0") || "0");
    const pricePerKm = new Decimal(String(formData.get("deliveryPricePerKm") ?? "0") || "0");
    const minOrder = new Decimal(String(formData.get("deliveryMinOrder") ?? "0") || "0");
    const maxKm = new Decimal(String(formData.get("deliveryMaxKm") ?? "0") || "0");
    if (baseFee.lt(0) || pricePerKm.lt(0) || minOrder.lt(0) || maxKm.lt(0)) {
      throw new Error("Los montos no pueden ser negativos.");
    }

    await prisma.sucursal.update({
      where: { id: user.sucursalId, organizationId: user.organizationId },
      data: {
        deliveryBaseFee: baseFee.toString(),
        deliveryPricePerKm: pricePerKm.toString(),
        deliveryMinOrder: minOrder.toString(),
        deliveryMaxKm: maxKm.toString(),
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la tarifa de envio." };
  }

  revalidatePath("/settings/store");
  return { success: true };
}

export async function updateDeliveryTimeSlots(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");

    const startTimeRaw = String(formData.get("deliveryStartTime") ?? "").trim();
    const slotMinutes = Number(formData.get("deliverySlotMinutes") ?? "30");
    const slotsCount = Number(formData.get("deliverySlotsCount") ?? "0");
    const slotCapacity = Number(formData.get("deliverySlotCapacity") ?? "1");
    const leadDays = Number(formData.get("deliveryLeadDays") ?? "0");

    if (slotsCount > 0 && !/^\d{1,2}:\d{2}$/.test(startTimeRaw)) {
      throw new Error("Indica una hora de inicio valida (ej. 14:00).");
    }
    if (slotMinutes <= 0) throw new Error("La duracion de cada horario debe ser mayor a 0.");
    if (slotsCount < 0) throw new Error("El numero de horarios no puede ser negativo.");
    if (slotCapacity <= 0) throw new Error("El cupo por horario debe ser al menos 1.");
    if (leadDays < 0) throw new Error("Los dias de anticipacion no pueden ser negativos.");

    await prisma.sucursal.update({
      where: { id: user.sucursalId, organizationId: user.organizationId },
      data: {
        deliveryStartTime: slotsCount > 0 ? startTimeRaw : null,
        deliverySlotMinutes: slotMinutes,
        deliverySlotsCount: slotsCount,
        deliverySlotCapacity: slotCapacity,
        deliveryLeadDays: leadDays,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar la configuracion de horarios." };
  }

  revalidatePath("/settings/store");
  return { success: true };
}

export async function addDeliveryDate(dateStr: string): Promise<{ error?: string }> {
  try {
    const user = await requireSucursalContext();
    if (user.role !== "OWNER") throw new Error("Solo el dueno de la cuenta puede configurar la tienda en linea.");
    if (!dateStr) throw new Error("Indica una fecha.");

    await prisma.storeDeliveryDate.upsert({
      where: { sucursalId_date: { sucursalId: user.sucursalId, date: new Date(`${dateStr}T00:00:00Z`) } },
      create: { sucursalId: user.sucursalId, date: new Date(`${dateStr}T00:00:00Z`) },
      update: {},
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo agregar la fecha." };
  }

  revalidatePath("/settings/store");
  return {};
}

export async function removeDeliveryDate(id: string): Promise<void> {
  const user = await requireSucursalContext();
  await prisma.storeDeliveryDate.deleteMany({ where: { id, sucursalId: user.sucursalId } });
  revalidatePath("/settings/store");
}
