-- AlterEnum
ALTER TYPE "Panel" ADD VALUE 'REQUISITIONS';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "nextRequisicionFolio" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "requisiciones" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "fromSucursalId" TEXT NOT NULL,
    "toSucursalId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requisiciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requisiciones_organizationId_folio_key" ON "requisiciones"("organizationId", "folio");

-- CreateIndex
CREATE INDEX "requisiciones_organizationId_fromSucursalId_date_idx" ON "requisiciones"("organizationId", "fromSucursalId", "date");

-- CreateIndex
CREATE INDEX "requisiciones_organizationId_toSucursalId_date_idx" ON "requisiciones"("organizationId", "toSucursalId", "date");

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_fromSucursalId_fkey" FOREIGN KEY ("fromSucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_toSucursalId_fkey" FOREIGN KEY ("toSucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisiciones" ADD CONSTRAINT "requisiciones_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "requisicion_items" (
    "id" TEXT NOT NULL,
    "requisicionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    CONSTRAINT "requisicion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisicion_items_requisicionId_idx" ON "requisicion_items"("requisicionId");

-- CreateIndex
CREATE INDEX "requisicion_items_productId_idx" ON "requisicion_items"("productId");

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_requisicionId_fkey" FOREIGN KEY ("requisicionId") REFERENCES "requisiciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
