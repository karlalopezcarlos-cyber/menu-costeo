-- Tasa de IVA de las ventas, a nivel organizacion. En restaurante el servicio de alimentos va
-- 16% parejo, asi que una sola tasa alcanza; el dia que haya venta en tasa 0 (pan para llevar,
-- despensa) esto se baja a la categoria de receta sin romper nada.
ALTER TABLE "organizations" ADD COLUMN "salesIvaRate" DECIMAL(5,2) NOT NULL DEFAULT 16;

-- IVA por tipo de gasto: la renta y la luz lo traen, la nomina no. Una tasa pareja sobre todos
-- los gastos estaria mal justo en el gasto mas grande.
ALTER TABLE "expense_categories" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 16;

-- El monto del gasto se captura CON IVA, tal como viene el recibo. Esta tasa dice cuanto de
-- ese monto es impuesto, para poder leer el gasto neto.
--
-- Los gastos que ya existen se quedan en 0: se capturaron sin registrar que tasa traian, y
-- ponerles 16 le quitaria IVA a la nomina, que no lo causa. Se corrigen con un UPDATE
-- deliberado una vez configuradas las tasas de cada tipo de gasto.
ALTER TABLE "expenses" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
