-- AlterEnum
ALTER TYPE "Unit" ADD VALUE 'OZ';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "presentationUnitLabel" TEXT;
ALTER TABLE "products" ADD COLUMN "presentationUnitQty" DECIMAL(14,4);
