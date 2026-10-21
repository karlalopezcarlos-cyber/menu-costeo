-- AlterTable
ALTER TABLE "daily_sales" ADD COLUMN "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX "daily_sales_createdByUserId_idx" ON "daily_sales"("createdByUserId");

-- AddForeignKey
ALTER TABLE "daily_sales" ADD CONSTRAINT "daily_sales_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "daily_sale_changes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "dailySaleId" TEXT,
    "recipeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "previousQuantity" DECIMAL(12,2),
    "newQuantity" DECIMAL(12,2),
    "previousPrice" DECIMAL(12,2),
    "newPrice" DECIMAL(12,2),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_sale_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_sale_changes_sucursalId_createdAt_idx" ON "daily_sale_changes"("sucursalId", "createdAt");
CREATE INDEX "daily_sale_changes_organizationId_date_idx" ON "daily_sale_changes"("organizationId", "date");
CREATE INDEX "daily_sale_changes_recipeId_date_idx" ON "daily_sale_changes"("recipeId", "date");

-- AddForeignKey
ALTER TABLE "daily_sale_changes" ADD CONSTRAINT "daily_sale_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_sale_changes" ADD CONSTRAINT "daily_sale_changes_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_sale_changes" ADD CONSTRAINT "daily_sale_changes_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_sale_changes" ADD CONSTRAINT "daily_sale_changes_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
