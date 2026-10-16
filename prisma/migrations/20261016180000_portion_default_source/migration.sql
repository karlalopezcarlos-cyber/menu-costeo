-- AlterTable
ALTER TABLE "products" ADD COLUMN "defaultSourceProductId" TEXT;

-- CreateIndex
CREATE INDEX "products_defaultSourceProductId_idx" ON "products"("defaultSourceProductId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_defaultSourceProductId_fkey" FOREIGN KEY ("defaultSourceProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
