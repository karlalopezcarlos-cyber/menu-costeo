-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "requestedDeliveryTime" TEXT;

-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "deliveryLeadDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliverySlotCapacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "deliverySlotMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "deliverySlotsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryStartTime" TEXT;
