-- CreateTable
CREATE TABLE "transformation_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transformation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transformation_template_outputs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "refQtyPerUnit" DECIMAL(14,6),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transformation_template_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transformation_templates_organizationId_name_key" ON "transformation_templates"("organizationId", "name");
CREATE INDEX "transformation_templates_organizationId_idx" ON "transformation_templates"("organizationId");
CREATE INDEX "transformation_templates_sourceProductId_idx" ON "transformation_templates"("sourceProductId");
CREATE UNIQUE INDEX "transformation_template_outputs_templateId_productId_key" ON "transformation_template_outputs"("templateId", "productId");
CREATE INDEX "transformation_template_outputs_templateId_idx" ON "transformation_template_outputs"("templateId");
CREATE INDEX "transformation_template_outputs_productId_idx" ON "transformation_template_outputs"("productId");

-- AddForeignKey
ALTER TABLE "transformation_templates" ADD CONSTRAINT "transformation_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transformation_templates" ADD CONSTRAINT "transformation_templates_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transformation_template_outputs" ADD CONSTRAINT "transformation_template_outputs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "transformation_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transformation_template_outputs" ADD CONSTRAINT "transformation_template_outputs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
