-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isCentral" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sucursales_organizationId_idx" ON "sucursales"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_organizationId_name_key" ON "sucursales"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sucursalId" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: una "Sucursal Principal" (isCentral=true) por cada organizacion existente, para que
-- las que operan en un solo local no noten ningun cambio.
INSERT INTO "sucursales" ("id", "organizationId", "name", "isCentral", "isActive", "createdAt")
SELECT gen_random_uuid()::text, "id", 'Sucursal Principal', true, true, CURRENT_TIMESTAMP
FROM "organizations";

-- Los STAFF existentes quedan asignados a la sucursal principal de su organizacion; OWNER y
-- SUPERADMIN quedan en NULL (ven/cambian entre todas las sucursales).
UPDATE "users" u
SET "sucursalId" = s."id"
FROM "sucursales" s
WHERE s."organizationId" = u."organizationId"
  AND s."isCentral" = true
  AND u."role" = 'STAFF';
