ALTER TABLE "organizations" ADD COLUMN "nextPurchaseFolio" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "purchases" ADD COLUMN "folio" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "purchaseDate" ASC, "createdAt" ASC) AS rn
  FROM "purchases"
)
UPDATE "purchases" p
SET "folio" = numbered.rn
FROM numbered
WHERE p.id = numbered.id;

ALTER TABLE "purchases" ALTER COLUMN "folio" SET NOT NULL;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organizationId_folio_key" UNIQUE ("organizationId", "folio");

UPDATE "organizations" o
SET "nextPurchaseFolio" = COALESCE((SELECT MAX(folio) FROM "purchases" p WHERE p."organizationId" = o.id), 0) + 1;
