-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('DRAFT', 'PROCESSED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('MATCHED', 'PENDING', 'IGNORED', 'ERROR');

-- CreateTable
CREATE TABLE "dish_aliases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "recipeId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dish_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_sales" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "quantitySold" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "headers" JSONB NOT NULL,
    "rawRows" JSONB NOT NULL,
    "columnMapping" JSONB,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsMatched" INTEGER NOT NULL DEFAULT 0,
    "rowsPending" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantitySold" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "matchedRecipeId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dish_aliases_organizationId_idx" ON "dish_aliases"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "dish_aliases_organizationId_normalizedName_key" ON "dish_aliases"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "monthly_sales_organizationId_year_month_idx" ON "monthly_sales"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_sales_organizationId_recipeId_year_month_key" ON "monthly_sales"("organizationId", "recipeId", "year", "month");

-- CreateIndex
CREATE INDEX "import_batches_organizationId_idx" ON "import_batches"("organizationId");

-- CreateIndex
CREATE INDEX "import_rows_importBatchId_idx" ON "import_rows"("importBatchId");

-- AddForeignKey
ALTER TABLE "dish_aliases" ADD CONSTRAINT "dish_aliases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_aliases" ADD CONSTRAINT "dish_aliases_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_sales" ADD CONSTRAINT "monthly_sales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_sales" ADD CONSTRAINT "monthly_sales_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_sales" ADD CONSTRAINT "monthly_sales_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
