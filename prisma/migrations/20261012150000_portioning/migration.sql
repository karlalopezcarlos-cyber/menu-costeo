-- AlterEnum
ALTER TYPE "Panel" ADD VALUE 'PORTIONING';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "nextPortioningFolio" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN "isPortion" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "portioning_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "productId" TEXT NOT NULL,
    "initialQty" DECIMAL(14,4) NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "realYieldPct" DECIMAL(5,2) NOT NULL,
    "comment" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portioning_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portioning_outputs" (
    "id" TEXT NOT NULL,
    "portioningEntryId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "portions" INTEGER NOT NULL,
    "portionQty" DECIMAL(14,4) NOT NULL,
    "realUnitCost" DECIMAL(14,6) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "portioning_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portioning_entries_organizationId_date_idx" ON "portioning_entries"("organizationId", "date");
CREATE INDEX "portioning_entries_organizationId_folio_idx" ON "portioning_entries"("organizationId", "folio");
CREATE INDEX "portioning_entries_sucursalId_date_idx" ON "portioning_entries"("sucursalId", "date");
CREATE INDEX "portioning_entries_organizationId_productId_idx" ON "portioning_entries"("organizationId", "productId");
CREATE INDEX "portioning_outputs_portioningEntryId_idx" ON "portioning_outputs"("portioningEntryId");
CREATE INDEX "portioning_outputs_recipeId_idx" ON "portioning_outputs"("recipeId");

-- AddForeignKey
ALTER TABLE "portioning_entries" ADD CONSTRAINT "portioning_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portioning_entries" ADD CONSTRAINT "portioning_entries_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portioning_entries" ADD CONSTRAINT "portioning_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portioning_entries" ADD CONSTRAINT "portioning_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portioning_outputs" ADD CONSTRAINT "portioning_outputs_portioningEntryId_fkey" FOREIGN KEY ("portioningEntryId") REFERENCES "portioning_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portioning_outputs" ADD CONSTRAINT "portioning_outputs_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
