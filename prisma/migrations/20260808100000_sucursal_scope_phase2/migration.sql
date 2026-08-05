-- Fase 2: escopar los modulos operativos por sucursal. Cada organizacion existente ya tiene
-- exactamente una sucursal marcada isCentral=true (backfill de la Fase 1), asi que el backfill de
-- abajo siempre encuentra destino y ninguna fila queda huerfana antes de aplicar NOT NULL.

-- 1) Agregar columnas nullable.
ALTER TABLE "purchases" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "daily_sales" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "recipes" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "recipes" ADD COLUMN "sourceRecipeId" TEXT;
ALTER TABLE "recipe_activities" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "dish_aliases" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "import_batches" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "inventory_counts" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "inventory_count_item_changes" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "audit_comments" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "waste_entries" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "production_entries" ADD COLUMN "sucursalId" TEXT;
ALTER TABLE "supplier_payments" ADD COLUMN "sucursalId" TEXT;

-- 2) Backfill: cada fila existente se asigna a la sucursal central de su organizacion.
UPDATE "purchases" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "purchase_orders" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "daily_sales" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "recipes" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "recipe_activities" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "dish_aliases" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "import_batches" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "inventory_counts" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "inventory_count_item_changes" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "audit_comments" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "waste_entries" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "production_entries" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;
UPDATE "supplier_payments" t SET "sucursalId" = s."id" FROM "sucursales" s WHERE s."organizationId" = t."organizationId" AND s."isCentral" = true;

-- 3) Ahora que todas las filas tienen sucursalId, se vuelve obligatorio.
ALTER TABLE "purchases" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "daily_sales" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "recipes" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "recipe_activities" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "dish_aliases" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "import_batches" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "inventory_counts" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "inventory_count_item_changes" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "audit_comments" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "waste_entries" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "production_entries" ALTER COLUMN "sucursalId" SET NOT NULL;
ALTER TABLE "supplier_payments" ALTER COLUMN "sucursalId" SET NOT NULL;

-- 4) Foreign keys hacia sucursales.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_sales" ADD CONSTRAINT "daily_sales_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_sourceRecipeId_fkey" FOREIGN KEY ("sourceRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipe_activities" ADD CONSTRAINT "recipe_activities_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dish_aliases" ADD CONSTRAINT "dish_aliases_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Recetas y DishAlias ahora son unicos por sucursal, no por organizacion completa (cada
-- sucursal puede tener "su" receta con el mismo nombre que otra sucursal, ya que son copias
-- independientes desde el clonado; ver decision de diseno en el plan de Sucursales).
DROP INDEX "recipes_organizationId_name_key";
CREATE UNIQUE INDEX "recipes_sucursalId_name_key" ON "recipes"("sucursalId", "name");

DROP INDEX "dish_aliases_organizationId_normalizedName_key";
CREATE UNIQUE INDEX "dish_aliases_sucursalId_normalizedName_key" ON "dish_aliases"("sucursalId", "normalizedName");

-- 6) Indices de consulta por sucursal.
CREATE INDEX "purchases_sucursalId_purchaseDate_idx" ON "purchases"("sucursalId", "purchaseDate");
CREATE INDEX "purchase_orders_sucursalId_status_idx" ON "purchase_orders"("sucursalId", "status");
CREATE INDEX "daily_sales_sucursalId_date_idx" ON "daily_sales"("sucursalId", "date");
CREATE INDEX "recipes_sucursalId_idx" ON "recipes"("sucursalId");
CREATE INDEX "inventory_counts_sucursalId_date_idx" ON "inventory_counts"("sucursalId", "date");
CREATE INDEX "waste_entries_sucursalId_date_idx" ON "waste_entries"("sucursalId", "date");
CREATE INDEX "production_entries_sucursalId_date_idx" ON "production_entries"("sucursalId", "date");
CREATE INDEX "supplier_payments_sucursalId_supplierId_idx" ON "supplier_payments"("sucursalId", "supplierId");
