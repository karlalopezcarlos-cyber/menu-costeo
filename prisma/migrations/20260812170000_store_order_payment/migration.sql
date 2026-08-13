-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "paymentLink" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'pickup_cash',
ADD COLUMN     "paymentPreferenceId" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid';
