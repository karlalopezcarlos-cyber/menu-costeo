-- CreateTable
CREATE TABLE "audit_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "finalCountId" TEXT NOT NULL,
    "productId" TEXT,
    "subRecipeId" TEXT,
    "comment" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audit_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_comments_finalCountId_productId_key" ON "audit_comments"("finalCountId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_comments_finalCountId_subRecipeId_key" ON "audit_comments"("finalCountId", "subRecipeId");

-- CreateIndex
CREATE INDEX "audit_comments_finalCountId_idx" ON "audit_comments"("finalCountId");

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_finalCountId_fkey" FOREIGN KEY ("finalCountId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
