"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { parseProductsWorkbook, type RowError } from "@/lib/excel/import-products";

export type ImportState = {
  errors?: RowError[];
  /** Mensaje de un problema general (archivo ilegible, sin permiso), no de una fila. */
  message?: string;
  result?: {
    creados: number;
    actualizados: number;
    omitidos: { name: string; excelRow: number }[];
    categoriasNuevas: string[];
  };
};

/**
 * Carga masiva de productos desde la plantilla de Excel.
 *
 * Es todo o nada: si una sola fila trae un error, no se guarda nada y se devuelven todos los
 * errores juntos, para que el usuario corrija una vez y vuelva a subir el mismo archivo en vez
 * de descubrir los problemas de uno en uno. Las categorias que no existen se crean.
 */
export async function importProducts(
  _prevState: ImportState | undefined,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireOrgSession();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Elige el archivo de Excel que quieres subir." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { message: "El archivo pesa mas de 5 MB. Si tienes miles de productos, subelos en dos partes." };
  }

  const actualizarExistentes = formData.get("actualizarExistentes") === "on";

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, errors } = await parseProductsWorkbook(buffer);
  if (errors.length > 0) {
    return { errors };
  }

  // Productos que ya existen, comparando sin distinguir mayusculas ni acentos de capitalizacion.
  const existentes = await prisma.product.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  const existentePorNombre = new Map(existentes.map((p) => [p.name.toUpperCase(), p]));

  const categoriasExistentes = await prisma.productCategory.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  const categoriaPorNombre = new Map(categoriasExistentes.map((c) => [c.name.toUpperCase(), c]));

  const categoriasNuevas: string[] = [];
  for (const row of rows) {
    if (!row.categoryName) continue;
    const clave = row.categoryName.toUpperCase();
    if (categoriaPorNombre.has(clave)) continue;
    const creada = await prisma.productCategory.create({
      data: { organizationId: user.organizationId, name: row.categoryName },
      select: { id: true, name: true },
    });
    categoriaPorNombre.set(clave, creada);
    categoriasNuevas.push(creada.name);
  }

  const omitidos: { name: string; excelRow: number }[] = [];
  let creados = 0;
  let actualizados = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const categoryId = row.categoryName
        ? (categoriaPorNombre.get(row.categoryName.toUpperCase())?.id ?? null)
        : null;

      const datos = {
        categoryId,
        baseUnit: row.baseUnit,
        yieldPercentage: row.yieldPercentage,
        targetStock: row.targetStock,
        presentationUnitLabel: row.presentationUnitLabel,
        presentationUnitQty: row.presentationUnitQty,
      };

      const existente = existentePorNombre.get(row.name.toUpperCase());
      if (existente) {
        if (!actualizarExistentes) {
          omitidos.push({ name: row.name, excelRow: row.excelRow });
          continue;
        }
        await tx.product.update({ where: { id: existente.id }, data: datos });
        actualizados++;
        continue;
      }

      await tx.product.create({
        data: { organizationId: user.organizationId, name: row.name, ...datos },
      });
      creados++;
    }
  });

  revalidatePath("/products");
  return { result: { creados, actualizados, omitidos, categoriasNuevas } };
}
