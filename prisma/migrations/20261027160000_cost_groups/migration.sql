-- CreateTable
CREATE TABLE "cost_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cost_groups_organizationId_name_key" ON "cost_groups"("organizationId", "name");
CREATE INDEX "cost_groups_organizationId_idx" ON "cost_groups"("organizationId");

ALTER TABLE "cost_groups" ADD CONSTRAINT "cost_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN "costGroupId" TEXT;
ALTER TABLE "recipe_categories" ADD COLUMN "costGroupId" TEXT;

CREATE INDEX "product_categories_costGroupId_idx" ON "product_categories"("costGroupId");
CREATE INDEX "recipe_categories_costGroupId_idx" ON "recipe_categories"("costGroupId");

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "cost_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_costGroupId_fkey" FOREIGN KEY ("costGroupId") REFERENCES "cost_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cada organizacion arranca con los tres grupos que tenia fijos, para que nada cambie de golpe.
INSERT INTO "cost_groups" ("id", "organizationId", "name", "sortOrder", "createdAt")
SELECT md5(o."id" || g."name"), o."id", g."name", g."ord", NOW()
FROM "organizations" o
CROSS JOIN (VALUES ('Alimento', 1), ('Bebidas', 2), ('Miscelaneos', 3)) AS g("name", "ord");

-- Y cada categoria queda apuntando al grupo equivalente al que ya tenia.
UPDATE "product_categories" pc
SET "costGroupId" = cg."id"
FROM "cost_groups" cg
WHERE cg."organizationId" = pc."organizationId"
  AND cg."name" = CASE pc."group"
    WHEN 'ALIMENTO' THEN 'Alimento'
    WHEN 'BEBIDAS' THEN 'Bebidas'
    WHEN 'MISCELANEOS' THEN 'Miscelaneos'
  END;

UPDATE "recipe_categories" rc
SET "costGroupId" = cg."id"
FROM "cost_groups" cg
WHERE cg."organizationId" = rc."organizationId"
  AND cg."name" = CASE rc."group"
    WHEN 'ALIMENTO' THEN 'Alimento'
    WHEN 'BEBIDAS' THEN 'Bebidas'
    WHEN 'MISCELANEOS' THEN 'Miscelaneos'
  END;
