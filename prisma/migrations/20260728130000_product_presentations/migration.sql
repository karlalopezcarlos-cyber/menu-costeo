CREATE TABLE "product_presentations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "Unit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_presentations_productId_label_key" ON "product_presentations"("productId", "label");

CREATE INDEX "product_presentations_organizationId_productId_idx" ON "product_presentations"("organizationId", "productId");

ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
