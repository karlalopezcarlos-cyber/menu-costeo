-- Los impuestos arrancan en cero y se prenden uno por uno.
--
-- Arrancaban en 16 suponiendo que la excepcion seria la tasa 0, y en un restaurante es al
-- reves: casi todo el almacen es alimento sin procesar, que va en tasa 0. Con el default en 16
-- habria que entrar a corregir casi todos los productos, y el que se escape queda cobrando un
-- IVA que su factura no trae.
--
-- El UPDATE deja en cero lo que ya existia, incluido lo que se haya alcanzado a configurar:
-- es justamente lo que se pidio, empezar de cero y marcar a mano los que si causan impuesto.
ALTER TABLE "products" ALTER COLUMN "ivaRate" SET DEFAULT 0;
UPDATE "products" SET "ivaRate" = 0;

ALTER TABLE "expense_categories" ALTER COLUMN "ivaRate" SET DEFAULT 0;
UPDATE "expense_categories" SET "ivaRate" = 0;

-- La tasa de ventas NO se toca. No es una preferencia de catalogo: los precios de venta se
-- capturan como vienen en la carta, con IVA adentro, y esa tasa es la que se les quita para
-- poder compararlos contra un costo que siempre es neto. Ponerla en cero no quitaria el
-- impuesto, nada mas dejaria de descontarlo y el food cost volveria a salir mas bajo de lo real.
