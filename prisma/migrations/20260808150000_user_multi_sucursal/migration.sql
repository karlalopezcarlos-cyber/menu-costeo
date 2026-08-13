-- CreateTable
CREATE TABLE "user_sucursales" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_sucursales_userId_idx" ON "user_sucursales"("userId");

-- CreateIndex
CREATE INDEX "user_sucursales_sucursalId_idx" ON "user_sucursales"("sucursalId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sucursales_userId_sucursalId_key" ON "user_sucursales"("userId", "sucursalId");

-- AddForeignKey
ALTER TABLE "user_sucursales" ADD CONSTRAINT "user_sucursales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sucursales" ADD CONSTRAINT "user_sucursales_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada STAFF que ya tenia una sucursal fija (users.sucursalId) recibe una fila en
-- user_sucursales con esa misma sucursal, para no perder su acceso al quitar la columna.
INSERT INTO "user_sucursales" ("id", "userId", "sucursalId", "createdAt")
SELECT substr(md5(random()::text || "id" || "sucursalId"), 1, 25), "id", "sucursalId", CURRENT_TIMESTAMP
FROM "users"
WHERE "sucursalId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_sucursalId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "sucursalId";
