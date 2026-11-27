"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { parsePluWorkbook, type RowError } from "@/lib/excel/import-plu";

export type ImportPluState = {
  errors?: RowError[];
  /** Un problema general (archivo ilegible, sin encabezados), no de una fila. */
  message?: string;
  result?: {
    creados: number;
    actualizados: number;
    omitidos: { name: string; excelRow: number }[];
    categoriasNuevas: string[];
    sucursalName: string;
    columnas: { name: string; price: string; category: string } | null;
  };
};

/**
 * Carga masiva de PLU (platillos de menu) desde la plantilla de Excel.
 *
 * Es todo o nada en cuanto a errores de formato: si una fila trae un precio ilegible o le falta
 * la categoria, no se guarda nada y se devuelven todos los errores juntos, para corregir una vez
 * y volver a subir el mismo archivo.
 *
 * Cada PLU nace con rendimiento 1 PZA y sin receta: es el esqueleto del menu. El costo llega
 * despues, con los ingredientes capturados o con Recetas > Cargar costos.
 *
 * Dos decisiones que conviene tener a la vista:
 *
 * - Solo da de alta en la sucursal activa. El alta de una en una (createRecipe) si clona a las
 *   demas sucursales cuando se crea en la central, pero hacer eso con un archivo de cientos de
 *   platillos escribiria en sucursales que quien sube el archivo no esta viendo. Para tenerlos
 *   en otra sucursal, se entra a esa sucursal y se sube el mismo archivo.
 *
 * - Un nombre que ya existe no se pisa por omision. Se reporta y se deja igual, salvo que se
 *   marque la casilla: un archivo del punto de venta trae precios viejos con frecuencia, y
 *   sobrescribir el precio de todo el menu sin pedirlo seria irreversible.
 */
export async function importPlu(
  _prevState: ImportPluState | undefined,
  formData: FormData,
): Promise<ImportPluState> {
  const user = await requireSucursalContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Elige el archivo de Excel que quieres subir." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { message: "El archivo pesa mas de 5 MB. Subelo en dos partes." };
  }

  const actualizarExistentes = formData.get("actualizarExistentes") === "on";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { message: "No se pudo leer el archivo. Vuelve a elegirlo e intenta de nuevo." };
  }

  const { rows, errors, columns } = await parsePluWorkbook(buffer);
  if (errors.length > 0) return { errors };

  try {
    const sucursal = await prisma.sucursal.findUnique({
      where: { id: user.sucursalId },
      select: { name: true },
    });

    // --- Categorias: crear las que falten y quedarse con el mapa nombre -> id ---
    const nombresCategoria = [...new Set(rows.map((r) => r.categoryName))];

    const categoriasPrevias = await prisma.recipeCategory.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    const categoriaPorNombre = new Map(categoriasPrevias.map((c) => [c.name.toUpperCase(), c]));

    const categoriasNuevas = nombresCategoria.filter((n) => !categoriaPorNombre.has(n.toUpperCase()));
    if (categoriasNuevas.length > 0) {
      await prisma.recipeCategory.createMany({
        data: categoriasNuevas.map((name) => ({ organizationId: user.organizationId, name })),
        skipDuplicates: true,
      });
      const refrescadas = await prisma.recipeCategory.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      categoriaPorNombre.clear();
      for (const c of refrescadas) categoriaPorNombre.set(c.name.toUpperCase(), c);
    }

    // --- Separar altas de las que ya existen ---
    // Incluye las archivadas a proposito: el nombre es unico por sucursal aunque este archivada,
    // asi que dar de alta encima reventaria la carga entera con un error de base de datos.
    const existentes = await prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId },
      select: { id: true, name: true },
    });
    const existentePorNombre = new Map(existentes.map((r) => [r.name.toUpperCase(), r]));

    const omitidos: { name: string; excelRow: number }[] = [];
    const porCrear: { name: string; sellingPrice: string; categoryId: string }[] = [];
    const porActualizar: { id: string; sellingPrice: string; categoryId: string }[] = [];

    for (const row of rows) {
      const categoryId = categoriaPorNombre.get(row.categoryName.toUpperCase())?.id;
      if (!categoryId) {
        // No deberia pasar: la categoria se acaba de crear. Si pasa, es mejor detenerse que
        // dar de alta el platillo sin categoria en silencio.
        return {
          message: `No se pudo preparar la categoria "${row.categoryName}". Vuelve a intentarlo.`,
        };
      }

      const existente = existentePorNombre.get(row.name.toUpperCase());
      if (existente) {
        if (actualizarExistentes) {
          porActualizar.push({ id: existente.id, sellingPrice: row.price, categoryId });
        } else {
          omitidos.push({ name: row.name, excelRow: row.excelRow });
        }
        continue;
      }
      porCrear.push({ name: row.name, sellingPrice: row.price, categoryId });
    }

    if (porCrear.length > 0) {
      await prisma.recipe.createMany({
        data: porCrear.map((r) => ({
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          name: r.name,
          categoryId: r.categoryId,
          // Un platillo que se vende rinde una pieza: asi el costo del platillo y el costo por
          // unidad son el mismo numero.
          yieldQty: "1",
          yieldUnit: "PIECE" as const,
          isMenuItem: true,
          sellingPrice: r.sellingPrice,
        })),
      });

      // La bitacora de cada receta se llena aparte porque createMany no devuelve los ids.
      const creadas = await prisma.recipe.findMany({
        where: { sucursalId: user.sucursalId, name: { in: porCrear.map((r) => r.name) } },
        select: { id: true },
      });
      await prisma.recipeActivity.createMany({
        data: creadas.map((r) => ({
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          recipeId: r.id,
          type: "CREATED" as const,
          message: "Platillo dado de alta en carga masiva de PLU",
          createdByUserId: user.id,
        })),
      });
    }

    // En lotes, para no abrir una transaccion larguisima con cientos de platillos.
    const TAMANO_LOTE = 25;
    for (let i = 0; i < porActualizar.length; i += TAMANO_LOTE) {
      const lote = porActualizar.slice(i, i + TAMANO_LOTE);
      await prisma.$transaction(
        lote.map((u) =>
          prisma.recipe.update({
            where: { id: u.id },
            data: { sellingPrice: u.sellingPrice, categoryId: u.categoryId },
          }),
        ),
      );
    }

    revalidatePath("/recipes");
    revalidatePath("/menu-engineering");
    revalidatePath("/dashboard");

    return {
      result: {
        creados: porCrear.length,
        actualizados: porActualizar.length,
        omitidos,
        categoriasNuevas,
        sucursalName: sucursal?.name ?? "esta sucursal",
        columnas: columns,
      },
    };
  } catch (error) {
    console.error("import-plu error:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    return { message: `No se pudo guardar la carga. El sistema reporto: ${detalle.slice(0, 300)}` };
  }
}
