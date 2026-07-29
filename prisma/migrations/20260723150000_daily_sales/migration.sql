-- Convierte el modelo de ventas de agregado mensual (year/month) a un registro por dia (date).

-- 1) monthly_sales -> daily_sales: agregar date, respaldar desde year/month (dia 1), quitar year/month.
ALTER TABLE "monthly_sales" ADD COLUMN "date" DATE;
UPDATE "monthly_sales" SET "date" = make_date("year", "month", 1);
ALTER TABLE "monthly_sales" ALTER COLUMN "date" SET NOT NULL;

DROP INDEX "monthly_sales_organizationId_recipeId_year_month_key";
DROP INDEX "monthly_sales_organizationId_year_month_idx";
ALTER TABLE "monthly_sales" DROP COLUMN "year";
ALTER TABLE "monthly_sales" DROP COLUMN "month";

ALTER TABLE "monthly_sales" RENAME TO "daily_sales";
ALTER TABLE "daily_sales" RENAME CONSTRAINT "monthly_sales_pkey" TO "daily_sales_pkey";
ALTER TABLE "daily_sales" RENAME CONSTRAINT "monthly_sales_organizationId_fkey" TO "daily_sales_organizationId_fkey";
ALTER TABLE "daily_sales" RENAME CONSTRAINT "monthly_sales_recipeId_fkey" TO "daily_sales_recipeId_fkey";
ALTER TABLE "daily_sales" RENAME CONSTRAINT "monthly_sales_importBatchId_fkey" TO "daily_sales_importBatchId_fkey";

CREATE UNIQUE INDEX "daily_sales_organizationId_recipeId_date_key" ON "daily_sales"("organizationId", "recipeId", "date");
CREATE INDEX "daily_sales_organizationId_date_idx" ON "daily_sales"("organizationId", "date");

-- 2) import_rows: agregar date (nullable), respaldar desde el year/month del batch padre.
ALTER TABLE "import_rows" ADD COLUMN "date" DATE;
UPDATE "import_rows" ir
SET "date" = make_date(ib."year", ib."month", 1)
FROM "import_batches" ib
WHERE ir."importBatchId" = ib."id";

-- 3) import_batches: ya no tiene un unico periodo por lote (cada fila trae su propia fecha).
ALTER TABLE "import_batches" DROP COLUMN "year";
ALTER TABLE "import_batches" DROP COLUMN "month";
