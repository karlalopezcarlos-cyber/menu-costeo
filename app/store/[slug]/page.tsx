import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { earliestAllowedDeliveryDate } from "@/lib/store/delivery-slots";
import StoreApp, { type MenuItem } from "./StoreApp";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const sucursal = await prisma.sucursal.findFirst({
    where: { storeSlug: slug, storeEnabled: true },
    include: { organization: { select: { name: true, logo: true } } },
  });
  if (!sucursal) notFound();

  const [recipes, deliveryDates] = await Promise.all([
    prisma.recipe.findMany({
      where: { sucursalId: sucursal.id, isMenuItem: true, archivedAt: null, sellingPrice: { not: null } },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: { category: true },
    }),
    prisma.storeDeliveryDate.findMany({
      // Solo se ofrecen fechas que cumplan la anticipacion minima configurada (deliveryLeadDays) --
      // una fecha configurada por el dueno no se le muestra al cliente si esta demasiado cerca.
      where: { sucursalId: sucursal.id, date: { gte: earliestAllowedDeliveryDate(sucursal.deliveryLeadDays) } },
      orderBy: { date: "asc" },
    }),
  ]);

  const menuItems: MenuItem[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.sellingPrice),
    description: r.storeDescription,
    hasPhoto: !!r.photo,
    categoryName: r.category?.name ?? null,
  }));

  const canDeliver = !!sucursal.businessLat && !!sucursal.businessLng;

  return (
    <StoreApp
      slug={slug}
      businessName={sucursal.organization.name}
      hasLogo={!!sucursal.organization.logo}
      menuItems={menuItems}
      canDeliver={canDeliver}
      deliveryMinOrder={Number(sucursal.deliveryMinOrder)}
      deliveryMaxKm={Number(sucursal.deliveryMaxKm)}
      deliveryLeadDays={sucursal.deliveryLeadDays}
      pickupAddress={sucursal.businessAddress}
      pickupLat={sucursal.businessLat ? Number(sucursal.businessLat) : null}
      pickupLng={sucursal.businessLng ? Number(sucursal.businessLng) : null}
      hasTimeSlots={sucursal.deliverySlotsCount > 0}
      availableDates={deliveryDates.map((d) => ({
        value: d.date.toISOString().slice(0, 10),
        label: d.date.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }),
      }))}
    />
  );
}
