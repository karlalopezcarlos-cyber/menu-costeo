-- Costo unitario capturado por sucursal. El catalogo de productos es de toda la organizacion
-- y su currentUnitCost es uno solo; esto permite que una sucursal recien abierta tenga sus
-- propios precios sin pisarle el costo a las demas.
CREATE TABLE "sucursal_product_costs" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitCost" DECIMAL(14,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursal_product_costs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sucursal_product_costs_sucursalId_productId_key" ON "sucursal_product_costs"("sucursalId", "productId");
CREATE INDEX "sucursal_product_costs_sucursalId_idx" ON "sucursal_product_costs"("sucursalId");

ALTER TABLE "sucursal_product_costs" ADD CONSTRAINT "sucursal_product_costs_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sucursal_product_costs" ADD CONSTRAINT "sucursal_product_costs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
