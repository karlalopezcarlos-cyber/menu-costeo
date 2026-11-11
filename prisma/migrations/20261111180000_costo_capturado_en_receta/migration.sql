-- Costo capturado a mano por receta, para el restaurante que todavia no tiene recetas ni
-- compras y necesita un Estado de Resultados. Nulo = no hay costo capturado; el costeo real
-- sigue mandando donde si alcanza a dar un numero confiable.
ALTER TABLE "recipes" ADD COLUMN "manualCost" DECIMAL(14,4);
