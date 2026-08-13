-- DropForeignKey
ALTER TABLE "requisicion_items" DROP CONSTRAINT "requisicion_items_productId_fkey";

-- AlterTable: productId ahora es opcional (mutuamente excluyente con subRecipeId); se agregan
-- subRecipeId (subreceta de la sucursal ORIGEN cuyo inventario se descuenta) y destSubRecipeId
-- (la copia equivalente de esa subreceta en la sucursal DESTINO, resuelta al crear la requisicion).
ALTER TABLE "requisicion_items"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN "subRecipeId" TEXT,
  ADD COLUMN "destSubRecipeId" TEXT;

-- CreateIndex
CREATE INDEX "requisicion_items_subRecipeId_idx" ON "requisicion_items"("subRecipeId");

-- CreateIndex
CREATE INDEX "requisicion_items_destSubRecipeId_idx" ON "requisicion_items"("destSubRecipeId");

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_destSubRecipeId_fkey" FOREIGN KEY ("destSubRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: exactamente uno de productId / subRecipeId debe estar presente
ALTER TABLE "requisicion_items"
  ADD CONSTRAINT "requisicion_item_exactly_one_target"
  CHECK (
    ("productId" IS NOT NULL AND "subRecipeId" IS NULL) OR
    ("productId" IS NULL AND "subRecipeId" IS NOT NULL)
  );
