-- CreateEnum
CREATE TYPE "CategoryGroup" AS ENUM ('ALIMENTO', 'BEBIDAS', 'MISCELANEOS');

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN "group" "CategoryGroup";

-- AlterTable
ALTER TABLE "recipe_categories" ADD COLUMN "group" "CategoryGroup";
