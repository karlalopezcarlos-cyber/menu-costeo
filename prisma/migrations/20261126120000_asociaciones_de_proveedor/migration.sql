-- Como se traduce un renglon de un documento de un proveedor a un producto del catalogo,
-- para no emparejar dos veces lo mismo.
--
-- Solo se crea la tabla nueva. El diff automatico tambien proponia borrar la tabla de ejemplo
-- de Neon, tirar tres indices y recrear dos llaves foraneas: eso es desajuste viejo entre el
-- historial de migraciones y la base de produccion, no tiene que ver con esto, y meterlo aqui
-- seria borrar cosas de produccion escondidas dentro de otra migracion.

-- CreateTable
CREATE TABLE "supplier_item_mappings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "claveDescripcion" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidadDocumento" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "factor" DECIMAL(18,8) NOT NULL,
    "presentationUnit" "Unit" NOT NULL,
    "presentationLabel" TEXT,
    "vecesUsada" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_item_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_item_mappings_organizationId_claveDescripcion_idx" ON "supplier_item_mappings"("organizationId", "claveDescripcion");

-- CreateIndex
CREATE INDEX "supplier_item_mappings_productId_idx" ON "supplier_item_mappings"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_item_mappings_organizationId_supplierId_claveDescr_key" ON "supplier_item_mappings"("organizationId", "supplierId", "claveDescripcion", "unidadDocumento");

-- AddForeignKey
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_item_mappings" ADD CONSTRAINT "supplier_item_mappings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El documento original del que salio una compra: la foto de la nota o el XML de la factura.

-- CreateEnum
CREATE TYPE "PurchaseDocumentType" AS ENUM ('FOTO', 'XML');

-- CreateTable
CREATE TABLE "purchase_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "tipo" "PurchaseDocumentType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "nombre" TEXT,
    "contenido" BYTEA NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_documents_organizationId_folio_idx" ON "purchase_documents"("organizationId", "folio");

-- AddForeignKey
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
