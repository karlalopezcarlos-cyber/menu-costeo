-- DropForeignKey
ALTER TABLE "audit_comments" DROP CONSTRAINT "audit_comments_productId_fkey";

-- DropForeignKey
ALTER TABLE "audit_comments" DROP CONSTRAINT "audit_comments_subRecipeId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_count_item_changes" DROP CONSTRAINT "inventory_count_item_changes_productId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_count_item_changes" DROP CONSTRAINT "inventory_count_item_changes_subRecipeId_fkey";

-- DropForeignKey
ALTER TABLE "requisicion_items" DROP CONSTRAINT "requisicion_items_productId_fkey";

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankInfo" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "creditDays" INTEGER,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "rfc" TEXT;

-- CreateTable
CREATE TABLE "supplier_phones" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_emails" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_phones_supplierId_idx" ON "supplier_phones"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_emails_supplierId_idx" ON "supplier_emails"("supplierId");

-- AddForeignKey
ALTER TABLE "supplier_phones" ADD CONSTRAINT "supplier_phones_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_emails" ADD CONSTRAINT "supplier_emails_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_item_changes" ADD CONSTRAINT "inventory_count_item_changes_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisicion_items" ADD CONSTRAINT "requisicion_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "inventory_count_item_changes_organizationId_inventoryCoun_idx" RENAME TO "inventory_count_item_changes_organizationId_inventoryCountI_idx";
