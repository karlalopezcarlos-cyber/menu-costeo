-- IVA de las ventas internas. El precio sigue siendo neto; lo que se guarda es la tasa, igual
-- que en compras y gastos: los montos se calculan, nunca se guardan.
ALTER TABLE "internal_transfer_prices" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "requisicion_items" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
