-- CreateTable
CREATE TABLE "production_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subRecipeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "comment" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_entries_organizationId_date_idx" ON "production_entries"("organizationId", "date");

-- CreateIndex
CREATE INDEX "production_entries_organizationId_subRecipeId_idx" ON "production_entries"("organizationId", "subRecipeId");

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
