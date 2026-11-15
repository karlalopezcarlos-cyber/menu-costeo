import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });

/**
 * El limite de 5 segundos que trae Prisma de fabrica es para una transaccion chica. Aqui las
 * grandes son reales: guardar un conteo de inventario escribe un renglon por producto contado,
 * y un almacen de restaurante pasa de los quinientos. Con la base en Neon, al otro lado de la
 * red, quinientos renglones rebasan los 5 segundos y la transaccion muere a la mitad.
 *
 * Veinte segundos dan margen de sobra sin dejar la base bloqueada si algo se atora.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    transactionOptions: { timeout: 20_000, maxWait: 10_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
