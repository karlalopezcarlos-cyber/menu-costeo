-- AlterTable: configuracion de porcion en el producto
ALTER TABLE "products" ADD COLUMN "portionQty" DECIMAL(14,4);
ALTER TABLE "products" ADD COLUMN "portionUnit" "Unit";
ALTER TABLE "products" ADD COLUMN "extrasRecipeId" TEXT;

-- AlterTable: la salida de una transformacion ahora es un producto
ALTER TABLE "portioning_outputs" ADD COLUMN "productId" TEXT;
ALTER TABLE "portioning_outputs" ADD COLUMN "qty" DECIMAL(14,4);
ALTER TABLE "portioning_outputs" ADD COLUMN "refQtyPerUnit" DECIMAL(14,6);
ALTER TABLE "portioning_outputs" ADD COLUMN "extraCostPerUnit" DECIMAL(14,6) NOT NULL DEFAULT 0;

-- Lo ya capturado se conserva: se copia a las columnas nuevas y las viejas quedan opcionales.
UPDATE "portioning_outputs" SET "qty" = "portions", "refQtyPerUnit" = "portionQty" WHERE "qty" IS NULL;
ALTER TABLE "portioning_outputs" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "portioning_outputs" ALTER COLUMN "portions" DROP NOT NULL;
ALTER TABLE "portioning_outputs" ALTER COLUMN "portionQty" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "portioning_outputs_productId_idx" ON "portioning_outputs"("productId");
CREATE INDEX "products_extrasRecipeId_idx" ON "products"("extrasRecipeId");

-- AddForeignKey
ALTER TABLE "portioning_outputs" ADD CONSTRAINT "portioning_outputs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_extrasRecipeId_fkey" FOREIGN KEY ("extrasRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
