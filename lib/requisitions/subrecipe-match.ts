import { prisma } from "@/lib/prisma";

/**
 * Cada sucursal tiene su propia copia independiente de cada subreceta (ver clonado en
 * app/(app)/recipes/actions.ts), asi que enviar una subreceta por requisicion requiere encontrar
 * cual copia, en la sucursal DESTINO, corresponde a la subreceta de la sucursal ORIGEN. Se busca,
 * en este orden: (1) destino es un clon directo del origen, (2) origen es un clon y destino es su
 * fuente, (3) ambas son clones hermanas de la misma fuente, (4) mismo nombre (respaldo). Si ninguna
 * aplica, el mapa regresa `null` para ese id y quien llama debe bloquear el envio.
 */
export async function resolveDestRecipeIds(
  originRecipeIds: string[],
  toSucursalId: string,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (originRecipeIds.length === 0) return result;

  const [origins, candidates] = await Promise.all([
    prisma.recipe.findMany({
      where: { id: { in: originRecipeIds } },
      select: { id: true, name: true, sourceRecipeId: true },
    }),
    prisma.recipe.findMany({
      where: { sucursalId: toSucursalId, archivedAt: null },
      select: { id: true, name: true, sourceRecipeId: true },
    }),
  ]);

  for (const origin of origins) {
    const match =
      candidates.find((c) => c.sourceRecipeId === origin.id) ??
      (origin.sourceRecipeId ? candidates.find((c) => c.id === origin.sourceRecipeId) : undefined) ??
      (origin.sourceRecipeId ? candidates.find((c) => c.sourceRecipeId === origin.sourceRecipeId) : undefined) ??
      candidates.find((c) => c.name.toLowerCase() === origin.name.toLowerCase());
    result.set(origin.id, match?.id ?? null);
  }
  return result;
}
