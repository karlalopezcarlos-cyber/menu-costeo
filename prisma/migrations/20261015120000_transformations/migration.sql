-- CreateEnum
CREATE TYPE "TransformationType" AS ENUM ('CLEANING', 'PORTIONING');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "isProcessed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "portioning_entries"
  ADD COLUMN "type" "TransformationType" NOT NULL DEFAULT 'PORTIONING',
  ADD COLUMN "outputProductId" TEXT,
  ADD COLUMN "outputQty" DECIMAL(14,4);

-- CreateIndex
CREATE INDEX "portioning_entries_organizationId_outputProductId_idx"
  ON "portioning_entries"("organizationId", "outputProductId");

-- AddForeignKey
ALTER TABLE "portioning_entries" ADD CONSTRAINT "portioning_entries_outputProductId_fkey"
  FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
