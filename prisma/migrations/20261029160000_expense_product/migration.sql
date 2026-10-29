-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_productId_idx" ON "expenses"("productId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
