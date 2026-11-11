"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { parseRecipeCostsWorkbook, type RowError } from "@/lib/excel/import-recipe-costs";

export type ImportCostsState = {
  errors?: RowError[];
  /** Un problema general (archivo ilegible, sin encabezados), no de una fila. */
  message?: string;
  result?: {
    actualizados: number;
    creados: number;
    sinCambio: number;
    noEncontrados: { name: string; excelRow: number }[];
    columnas: { recipe: string; cost: string } | null;
  };
};

/**
 * Carga masiva de costos por platillo.
 *
 * Es todo o nada en cuanto a errores de formato: si una fila trae un costo ilegible, no se
 * guarda nada y se devuelven todos los errores juntos, para corregir una vez y volver a subir
 * el mismo archivo.
 *
 * Los platillos que no existen son harina de otro costal: no son un error del archivo, son
 * nombres que todavia no estan dados de alta. Se reportan aparte, y solo se crean si quien sube
 * el archivo lo pidio explicitamente. Un typo en un nombre no debe inventar un platillo nuevo
 * en el menu sin que nadie se entere.
 */
export async function importRecipeCosts(
  _prevState: ImportCostsState | undefined,
  formData: FormData,
): Promise<ImportCostsState> {
  const user = await requireSucursalContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Elige el archivo de Excel que quieres subir." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { message: "El archivo pesa mas de 5 MB. Subelo en dos partes." };
  }

  const crearFaltantes = formData.get("crearFaltantes") === "on";

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { message: "No se pudo leer el archivo. Vuelve a elegirlo e intenta de nuevo." };
  }

  const { rows, errors, columns } = await parseRecipeCostsWorkbook(buffer);
  if (errors.length > 0) return { errors };
  if (rows.length === 0) {
    return { message: "El archivo no trae ningun costo. Revisa que la columna de costo tenga datos." };
  }

  try {
    // Incluye las archivadas a proposito: si un nombre ya existe archivado y no se mirara aqui,
    // la casilla de dar de alta crearia un platillo duplicado con el mismo nombre. Ponerle el
    // costo a la archivada no estorba -no sale en ningun reporte- y evita el duplicado.
    const existentes = await prisma.recipe.findMany({
      where: { sucursalId: user.sucursalId },
      select: { id: true, name: true, manualCost: true },
    });
    const porNombre = new Map(existentes.map((r) => [r.name.trim().toUpperCase(), r]));

    const noEncontrados: { name: string; excelRow: number }[] = [];
    const porActualizar: { id: string; cost: string }[] = [];
    const porCrear: { name: string; cost: string }[] = [];
    let sinCambio = 0;

    for (const row of rows) {
      const existente = porNombre.get(row.recipeName.trim().toUpperCase());
      if (!existente) {
        if (crearFaltantes) porCrear.push({ name: row.recipeName, cost: row.cost.toString() });
        else noEncontrados.push({ name: row.recipeName, excelRow: row.excelRow });
        continue;
      }
      const previo = existente.manualCost;
      if (previo !== null && row.cost.equals(previo.toString())) {
        sinCambio++;
        continue;
      }
      porActualizar.push({ id: existente.id, cost: row.cost.toString() });
    }

    if (porCrear.length > 0) {
      await prisma.recipe.createMany({
        data: porCrear.map((r) => ({
          organizationId: user.organizationId,
          sucursalId: user.sucursalId,
          name: r.name,
          // Un platillo que se vende: rinde una pieza. El costo capturado vale por ese
          // rendimiento, asi que costo del platillo y costo de la receta son el mismo numero.
          yieldQty: "1",
          yieldUnit: "PIECE" as const,
          isMenuItem: true,
          manualCost: r.cost,
        })),
      });
    }

    // En lotes, para no abrir una transaccion larguisima con cientos de platillos.
    const TAMANO_LOTE = 25;
    for (let i = 0; i < porActualizar.length; i += TAMANO_LOTE) {
      const lote = porActualizar.slice(i, i + TAMANO_LOTE);
      await prisma.$transaction(
        lote.map((u) =>
          prisma.recipe.update({ where: { id: u.id }, data: { manualCost: u.cost } }),
        ),
      );
    }

    revalidatePath("/recipes");
    revalidatePath("/menu-engineering");
    revalidatePath("/dashboard");
    return {
      result: {
        actualizados: porActualizar.length,
        creados: porCrear.length,
        sinCambio,
        noEncontrados,
        columnas: columns,
      },
    };
  } catch (error) {
    console.error("import-recipe-costs error:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    return { message: `No se pudo guardar la carga. El sistema reporto: ${detalle.slice(0, 300)}` };
  }
}
