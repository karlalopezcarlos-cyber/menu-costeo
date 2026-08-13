-- CreateTable
CREATE TABLE "planning_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "targetsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_run_items" (
    "id" TEXT NOT NULL,
    "planningRunId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "productId" TEXT,
    "subRecipeId" TEXT,
    "netQty" DECIMAL(14,4) NOT NULL,
    "unit" "Unit" NOT NULL,
    "comment" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "planning_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planning_runs_sucursalId_createdAt_idx" ON "planning_runs"("sucursalId", "createdAt");

-- CreateIndex
CREATE INDEX "planning_run_items_planningRunId_idx" ON "planning_run_items"("planningRunId");

-- AddForeignKey
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_run_items" ADD CONSTRAINT "planning_run_items_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "planning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_run_items" ADD CONSTRAINT "planning_run_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_run_items" ADD CONSTRAINT "planning_run_items_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
