-- CreateEnum
CREATE TYPE "WasteConcept" AS ENUM ('MERMA', 'SERVICIO', 'PRUEBAS');

-- AlterTable
ALTER TABLE "waste_entries" ADD COLUMN "concept" "WasteConcept" NOT NULL DEFAULT 'MERMA';

-- CreateIndex
CREATE INDEX "waste_entries_sucursalId_concept_idx" ON "waste_entries"("sucursalId", "concept");
