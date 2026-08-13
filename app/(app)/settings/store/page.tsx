import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import SettingsNav from "../SettingsNav";
import StoreSettingsForm from "./StoreSettingsForm";
import BusinessLocationForm from "./BusinessLocationForm";
import DeliveryPricingForm from "./DeliveryPricingForm";
import DeliveryDatesManager from "./DeliveryDatesManager";
import DeliveryTimeSlotsForm from "./DeliveryTimeSlotsForm";

export default async function StoreSettingsPage() {
  const user = await requireSucursalContext();

  const sucursal = await prisma.sucursal.findUniqueOrThrow({
    where: { id: user.sucursalId },
    select: {
      name: true,
      storeSlug: true,
      storeEnabled: true,
      businessAddress: true,
      businessLat: true,
      businessLng: true,
      deliveryBaseFee: true,
      deliveryPricePerKm: true,
      deliveryMinOrder: true,
      deliveryMaxKm: true,
      deliveryStartTime: true,
      deliverySlotMinutes: true,
      deliverySlotsCount: true,
      deliverySlotCapacity: true,
      deliveryLeadDays: true,
    },
  });

  const deliveryDates = await prisma.storeDeliveryDate.findMany({
    where: { sucursalId: user.sucursalId, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    orderBy: { date: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/store" />
        <p className="mt-3 text-sm text-neutral-500">
          Configura el link publico donde tus clientes pueden ver tu menu y hacer pedidos, para la
          sucursal <strong>{sucursal.name}</strong>.
        </p>
      </div>

      {user.role !== "OWNER" ? (
        <p className="text-sm text-neutral-500">Solo el dueno de la cuenta puede configurar la tienda en linea.</p>
      ) : (
        <>
          <StoreSettingsForm storeSlug={sucursal.storeSlug ?? ""} storeEnabled={sucursal.storeEnabled} />

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-neutral-900">Envio a domicilio</h2>
            <p className="text-sm text-neutral-500">
              Para calcular el costo de envio necesitamos saber desde donde sales, tu tarifa, y que
              dias tienes disponibles para entregar.
            </p>
          </div>

          <BusinessLocationForm
            businessAddress={sucursal.businessAddress ?? ""}
            businessLat={sucursal.businessLat ? Number(sucursal.businessLat) : null}
            businessLng={sucursal.businessLng ? Number(sucursal.businessLng) : null}
          />
          <DeliveryPricingForm
            deliveryBaseFee={sucursal.deliveryBaseFee.toString()}
            deliveryPricePerKm={sucursal.deliveryPricePerKm.toString()}
            deliveryMinOrder={sucursal.deliveryMinOrder.toString()}
            deliveryMaxKm={sucursal.deliveryMaxKm.toString()}
          />
          <DeliveryTimeSlotsForm
            deliveryStartTime={sucursal.deliveryStartTime ?? ""}
            deliverySlotMinutes={sucursal.deliverySlotMinutes}
            deliverySlotsCount={sucursal.deliverySlotsCount}
            deliverySlotCapacity={sucursal.deliverySlotCapacity}
            deliveryLeadDays={sucursal.deliveryLeadDays}
          />
          <DeliveryDatesManager
            dates={deliveryDates.map((d) => ({
              id: d.id,
              dateLabel: d.date.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }),
            }))}
          />
        </>
      )}
    </div>
  );
}
