ALTER TABLE "purchases" DROP CONSTRAINT "purchases_organizationId_folio_key";

CREATE INDEX "purchases_organizationId_folio_idx" ON "purchases"("organizationId", "folio");
