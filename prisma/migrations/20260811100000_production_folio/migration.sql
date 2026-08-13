-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "nextProductionFolio" INTEGER NOT NULL DEFAULT 1;

-- AlterTable (nullable primero: se llena con un backfill antes de exigir NOT NULL)
ALTER TABLE "production_entries" ADD COLUMN     "folio" INTEGER;

-- Backfill: cada produccion ya registrada recibe su propio folio consecutivo dentro de su
-- organizacion (no hay forma de saber, para datos viejos, cuales filas se capturaron juntas en un
-- mismo envio del formulario, asi que aqui se les da un folio por fila; los envios nuevos si
-- comparten un solo folio entre sus renglones, como ya hacen Compras/Pedidos/Requisiciones).
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "production_entries"
)
UPDATE "production_entries" AS pe
SET "folio" = numbered.rn
FROM numbered
WHERE pe."id" = numbered."id";

-- Deja el contador de cada organizacion listo para continuar despues del folio mas alto ya usado.
UPDATE "organizations" AS o
SET "nextProductionFolio" = COALESCE(
  (SELECT MAX("folio") + 1 FROM "production_entries" WHERE "organizationId" = o."id"),
  1
);

-- AlterTable
ALTER TABLE "production_entries" ALTER COLUMN "folio" SET NOT NULL;

-- CreateIndex
CREATE INDEX "production_entries_organizationId_folio_idx" ON "production_entries"("organizationId", "folio");
