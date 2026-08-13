-- DropForeignKey
ALTER TABLE "waste_entries" DROP CONSTRAINT "waste_entries_productId_fkey";

-- AlterTable: productId ahora es opcional (mutuamente excluyente con subRecipeId); se agrega
-- subRecipeId para poder mermar una subreceta o un PLU (platillo de menu) ya preparado completo.
ALTER TABLE "waste_entries" ADD COLUMN     "subRecipeId" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "waste_entries_subRecipeId_idx" ON "waste_entries"("subRecipeId");

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: exactamente uno de productId / subRecipeId debe estar presente
ALTER TABLE "waste_entries"
  ADD CONSTRAINT "waste_entry_exactly_one_target"
  CHECK (
    ("productId" IS NOT NULL AND "subRecipeId" IS NULL) OR
    ("productId" IS NULL AND "subRecipeId" IS NOT NULL)
  );
