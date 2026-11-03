-- Tasas de impuesto por producto. El IVA arranca en 16 porque es la tasa general; los
-- productos que van en 0 (la mayoria de los alimentos) se corrigen uno por uno. El IEPS
-- arranca en 0: casi nada lo causa, y marcarlo de mas inventaria impuesto.
ALTER TABLE "products" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 16;
ALTER TABLE "products" ADD COLUMN "iepsRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Las tasas se congelan en cada compra, como ya se congela el costo unitario: si manana se
-- corrige la tasa de un producto, las compras viejas tienen que seguir diciendo lo que decia
-- su factura.
--
-- Las compras que ya existen se quedan en 0 a proposito. Se capturaron sin impuesto y no hay
-- forma de saber que tasa traia cada factura; heredarles la tasa nueva del producto le
-- inventaria IVA a meses que ya se cerraron y se entregaron.
ALTER TABLE "purchases" ADD COLUMN "ivaRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN "iepsRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
