-- Precio de venta interno: a cuanto una sucursal le traspasa un producto o una subreceta a otra.

-- El panel del modulo de Ventas internas.
ALTER TYPE "Panel" ADD VALUE IF NOT EXISTS 'INTERNAL_SALES';

-- Precio congelado en el renglon de la requisicion, igual que ya se congela el costo.
-- Nullable a proposito: las requisiciones que ya existen y los renglones sin precio capturado
-- siguen yendo a costo, como antes.
ALTER TABLE "requisicion_items" ADD COLUMN "unitPrice" DECIMAL(14,6);

-- La tabla de precios vigentes. La llave es la sucursal que VENDE, no el catalogo.
CREATE TABLE "internal_transfer_prices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "productId" TEXT,
    "recipeId" TEXT,
    "price" DECIMAL(14,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_transfer_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_transfer_prices_sucursalId_productId_key"
    ON "internal_transfer_prices"("sucursalId", "productId");
CREATE UNIQUE INDEX "internal_transfer_prices_sucursalId_recipeId_key"
    ON "internal_transfer_prices"("sucursalId", "recipeId");
CREATE INDEX "internal_transfer_prices_organizationId_idx"
    ON "internal_transfer_prices"("organizationId");

ALTER TABLE "internal_transfer_prices" ADD CONSTRAINT "internal_transfer_prices_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_transfer_prices" ADD CONSTRAINT "internal_transfer_prices_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_transfer_prices" ADD CONSTRAINT "internal_transfer_prices_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "internal_transfer_prices" ADD CONSTRAINT "internal_transfer_prices_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
