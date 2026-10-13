-- AlterTable
ALTER TABLE "purchases" ADD COLUMN "invoiceFolio" TEXT;

-- CreateIndex
CREATE INDEX "purchases_organizationId_invoiceFolio_idx" ON "purchases"("organizationId", "invoiceFolio");
