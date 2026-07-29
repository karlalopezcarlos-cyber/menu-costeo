-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "comment" TEXT;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
