ALTER TABLE "organizations" ADD COLUMN "nextOrderFolio" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "purchase_orders" ADD COLUMN "folio" INTEGER;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt" ASC) AS rn
  FROM "purchase_orders"
)
UPDATE "purchase_orders" p
SET "folio" = numbered.rn
FROM numbered
WHERE p.id = numbered.id;

ALTER TABLE "purchase_orders" ALTER COLUMN "folio" SET NOT NULL;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_folio_key" UNIQUE ("organizationId", "folio");

UPDATE "organizations" o
SET "nextOrderFolio" = COALESCE((SELECT MAX(folio) FROM "purchase_orders" p WHERE p."organizationId" = o.id), 0) + 1;
