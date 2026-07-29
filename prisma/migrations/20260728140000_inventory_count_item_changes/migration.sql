CREATE TABLE "inventory_count_item_changes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "productId" TEXT,
    "subRecipeId" TEXT,
    "previousQuantity" DECIMAL(14,4),
    "newQuantity" DECIMAL(14,4) NOT NULL,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_count_item_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_count_item_changes_organizationId_inventoryCoun_idx" ON "inventory_count_item_changes"("organizationId", "inventoryCountId", "changedAt");

ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
