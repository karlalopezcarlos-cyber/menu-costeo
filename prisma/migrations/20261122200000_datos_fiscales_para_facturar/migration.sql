-- Datos fiscales para poder facturar un traspaso entre sucursales con RFC distinto.
-- Todos opcionales: la mayoria de las organizaciones no factura entre sucursales, y hacerlos
-- obligatorios romperia el alta de una sucursal nueva.
ALTER TABLE "sucursales" ADD COLUMN "rfc" TEXT;
ALTER TABLE "sucursales" ADD COLUMN "razonSocial" TEXT;
ALTER TABLE "sucursales" ADD COLUMN "regimenFiscal" TEXT;
ALTER TABLE "sucursales" ADD COLUMN "codigoPostalFiscal" TEXT;
ALTER TABLE "sucursales" ADD COLUMN "usoCfdi" TEXT;

-- Clave del producto/servicio del SAT, obligatoria en cada concepto de un CFDI.
-- La ClaveUnidad no se guarda: sale sola de la unidad base (ver lib/cfdi.ts).
ALTER TABLE "products" ADD COLUMN "claveProdServ" TEXT;
ALTER TABLE "recipes" ADD COLUMN "claveProdServ" TEXT;
