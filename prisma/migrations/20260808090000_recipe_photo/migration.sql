-- Foto opcional de la receta, embebida en la base de datos (sin servicio de almacenamiento externo).
ALTER TABLE "recipes" ADD COLUMN "photo" BYTEA;
ALTER TABLE "recipes" ADD COLUMN "photoMimeType" TEXT;
