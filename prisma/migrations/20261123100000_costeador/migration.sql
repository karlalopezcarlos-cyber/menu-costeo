-- Costeador: recetas de prueba que todavia no existen.
--
-- Tablas propias y no una bandera en recipes. El catalogo lo leen el costeo, las ventas, la
-- ingenieria de menu, el inventario, las requisiciones y la tienda; una bandera tendria que
-- respetarse en todas esas consultas y basta olvidar una para que un platillo que nadie
-- autorizo aparezca vendible. Esto no se puede colar.
ALTER TYPE "Panel" ADD VALUE IF NOT EXISTS 'COSTEADOR';

CREATE TABLE "costeador" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "yieldQty" DECIMAL(14,4) NOT NULL,
    "yieldUnit" "Unit" NOT NULL,
    "isMenuItem" BOOLEAN NOT NULL DEFAULT true,
    "sellingPrice" DECIMAL(12,2),
    "notes" TEXT,
    "recipeId" TEXT,
    "transferredAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costeador_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "costeador_items" (
    "id" TEXT NOT NULL,
    "costeadorId" TEXT NOT NULL,
    "productId" TEXT,
    "subRecipeId" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" "Unit" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costeador_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "costeador_organizationId_idx" ON "costeador"("organizationId");
CREATE INDEX "costeador_sucursalId_idx" ON "costeador"("sucursalId");
CREATE INDEX "costeador_items_costeadorId_idx" ON "costeador_items"("costeadorId");
CREATE INDEX "costeador_items_productId_idx" ON "costeador_items"("productId");
CREATE INDEX "costeador_items_subRecipeId_idx" ON "costeador_items"("subRecipeId");

ALTER TABLE "costeador" ADD CONSTRAINT "costeador_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeador" ADD CONSTRAINT "costeador_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeador" ADD CONSTRAINT "costeador_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "recipe_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "costeador" ADD CONSTRAINT "costeador_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "costeador" ADD CONSTRAINT "costeador_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "costeador_items" ADD CONSTRAINT "costeador_items_costeadorId_fkey" FOREIGN KEY ("costeadorId") REFERENCES "costeador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "costeador_items" ADD CONSTRAINT "costeador_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "costeador_items" ADD CONSTRAINT "costeador_items_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
