-- Soporta el filtro por defecto de "compras de hoy" y busquedas por rango de fecha
-- sin depender del indice compuesto (organizationId, productId, purchaseDate), que no
-- sirve para ordenar/filtrar por fecha cuando no se filtra tambien por producto.
CREATE INDEX "purchases_organizationId_purchaseDate_idx" ON "purchases"("organizationId", "purchaseDate");
