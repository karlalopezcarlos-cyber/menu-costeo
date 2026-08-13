-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryDistanceKm" DECIMAL(8,2),
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryLat" DECIMAL(10,6),
ADD COLUMN     "deliveryLng" DECIMAL(10,6),
ADD COLUMN     "requestedDeliveryDate" DATE;

-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "businessAddress" TEXT,
ADD COLUMN     "businessLat" DECIMAL(10,6),
ADD COLUMN     "businessLng" DECIMAL(10,6),
ADD COLUMN     "deliveryBaseFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryMinOrder" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryPricePerKm" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "store_delivery_dates" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_delivery_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_delivery_dates_sucursalId_date_idx" ON "store_delivery_dates"("sucursalId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "store_delivery_dates_sucursalId_date_key" ON "store_delivery_dates"("sucursalId", "date");

-- AddForeignKey
ALTER TABLE "store_delivery_dates" ADD CONSTRAINT "store_delivery_dates_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
