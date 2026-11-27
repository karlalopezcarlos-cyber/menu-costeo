-- Bitacora de una compra: quien la registro, quien le movio algo despues y a que hora.
--
-- Solo se crea la tabla nueva. El diff automatico volvia a proponer borrar la tabla de ejemplo
-- de Neon, tirar tres indices y recrear dos llaves foraneas: es desajuste viejo entre el
-- historial de migraciones y la base de produccion, no tiene que ver con esto, y meterlo aqui
-- seria borrar cosas de produccion escondidas dentro de otra migracion.

-- CreateEnum
CREATE TYPE "PurchaseActivityType" AS ENUM ('REGISTRADA', 'RENGLON_AGREGADO', 'RENGLON_EDITADO', 'RENGLON_BORRADO', 'DATOS_EDITADOS');

-- CreateTable
CREATE TABLE "purchase_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "type" "PurchaseActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_activities_organizationId_folio_createdAt_idx" ON "purchase_activities"("organizationId", "folio", "createdAt");

-- AddForeignKey
ALTER TABLE "purchase_activities" ADD CONSTRAINT "purchase_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_activities" ADD CONSTRAINT "purchase_activities_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_activities" ADD CONSTRAINT "purchase_activities_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
