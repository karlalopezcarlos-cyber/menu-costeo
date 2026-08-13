-- AlterTable
ALTER TABLE "planning_run_items" ADD COLUMN     "grossQty" DECIMAL(14,4) NOT NULL,
ADD COLUMN     "onHandQty" DECIMAL(14,4) NOT NULL;
