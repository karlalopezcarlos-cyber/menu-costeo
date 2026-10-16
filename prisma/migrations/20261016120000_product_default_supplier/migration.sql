-- AlterTable
ALTER TABLE "products" ADD COLUMN "defaultSupplierId" TEXT;

-- CreateIndex
CREATE INDEX "products_defaultSupplierId_idx" ON "products"("defaultSupplierId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
