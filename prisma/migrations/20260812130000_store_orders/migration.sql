-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "nextStoreOrderFolio" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "storeDescription" TEXT;

-- AlterTable
ALTER TABLE "sucursales" ADD COLUMN     "storeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "storeSlug" TEXT;

-- CreateTable
CREATE TABLE "store_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "fulfillmentType" TEXT NOT NULL DEFAULT 'pickup',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_order_items" (
    "id" TEXT NOT NULL,
    "storeOrderId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "store_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_orders_organizationId_folio_idx" ON "store_orders"("organizationId", "folio");

-- CreateIndex
CREATE INDEX "store_orders_sucursalId_status_idx" ON "store_orders"("sucursalId", "status");

-- CreateIndex
CREATE INDEX "store_order_items_storeOrderId_idx" ON "store_order_items"("storeOrderId");

-- CreateIndex
CREATE INDEX "store_order_items_recipeId_idx" ON "store_order_items"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_storeSlug_key" ON "sucursales"("storeSlug");

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_storeOrderId_fkey" FOREIGN KEY ("storeOrderId") REFERENCES "store_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
