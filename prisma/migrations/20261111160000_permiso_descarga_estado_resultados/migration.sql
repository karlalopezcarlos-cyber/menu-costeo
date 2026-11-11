-- Permisos finos por usuario: un panel decide si la pantalla se ve, esto decide que se puede
-- hacer dentro de ella.
CREATE TYPE "UserPermission" AS ENUM ('EXPORT_INCOME_STATEMENT');

-- Arranca vacio para todos. Nadie pierde acceso a una pantalla: lo que se cierra es bajar el
-- Estado de Resultados como archivo, y solo para STAFF (los OWNER no pasan por esta lista).
ALTER TABLE "users" ADD COLUMN "permissions" "UserPermission"[] DEFAULT ARRAY[]::"UserPermission"[];
