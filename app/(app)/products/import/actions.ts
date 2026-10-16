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
    proveedoresNuevos: string[];
  };
};

/**
 * Carga masiva de productos desde la plantilla de Excel.
 *
 * Es todo o nada: si una sola fila trae un error, no se guarda nada y se devuelven todos los
 * errores juntos, para que el usuario corrija una vez y vuelva a subir el mismo archivo en vez
 * de descubrir los problemas de uno en uno. Las categorias y los proveedores que no existen se
 * crean (el proveedor nada mas con el nombre: sus datos de contacto se completan despues).
 *
 * Las altas se hacen con un solo createMany y las actualizaciones en un $transaction por lotes:
 * con un catalogo de cientos de productos, insertarlos uno por uno dentro de una transaccion
 * interactiva se pasa del limite de tiempo de Prisma y la carga entera falla.
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

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { message: "No se pudo leer el archivo. Vuelve a elegirlo e intenta de nuevo." };
  }

  const { rows, errors } = await parseProductsWorkbook(buffer);
  if (errors.length > 0) {
    return { errors };
  }

  try {
    // --- Categorias: crear las que falten y quedarse con el mapa nombre -> id ---
    const nombresCategoria = [...new Set(rows.map((r) => r.categoryName).filter((c): c is string => Boolean(c)))];

    const categoriasPrevias = await prisma.productCategory.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    const categoriaPorNombre = new Map(categoriasPrevias.map((c) => [c.name.toUpperCase(), c]));

    const categoriasNuevas = nombresCategoria.filter((n) => !categoriaPorNombre.has(n.toUpperCase()));
    if (categoriasNuevas.length > 0) {
      await prisma.productCategory.createMany({
        data: categoriasNuevas.map((name) => ({ organizationId: user.organizationId, name })),
        skipDuplicates: true,
      });
      const refrescadas = await prisma.productCategory.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      categoriaPorNombre.clear();
      for (const c of refrescadas) categoriaPorNombre.set(c.name.toUpperCase(), c);
    }

    // --- Proveedores: igual que las categorias, se crean los que falten ---
    const nombresProveedor = [
      ...new Set(rows.map((r) => r.supplierName).filter((n): n is string => Boolean(n))),
    ];

    const proveedoresPrevios = await prisma.supplier.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    const proveedorPorNombre = new Map(proveedoresPrevios.map((p) => [p.name.toUpperCase(), p]));

    const proveedoresNuevos = nombresProveedor.filter((n) => !proveedorPorNombre.has(n.toUpperCase()));
    if (proveedoresNuevos.length > 0) {
      await prisma.supplier.createMany({
        data: proveedoresNuevos.map((name) => ({ organizationId: user.organizationId, name })),
        skipDuplicates: true,
      });
      const refrescados = await prisma.supplier.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
      proveedorPorNombre.clear();
      for (const p of refrescados) proveedorPorNombre.set(p.name.toUpperCase(), p);
    }

    // --- Separar altas de actualizaciones ---
    const existentes = await prisma.product.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    const existentePorNombre = new Map(existentes.map((p) => [p.name.toUpperCase(), p]));

    const omitidos: { name: string; excelRow: number }[] = [];
    const porCrear: {
      organizationId: string;
      name: string;
      categoryId: string | null;
      baseUnit: (typeof rows)[number]["baseUnit"];
      yieldPercentage: string;
      targetStock: string;
      presentationUnitLabel: string | null;
      presentationUnitQty: string | null;
      defaultSupplierId: string | null;
    }[] = [];
    const porActualizar: { id: string; data: Record<string, unknown> }[] = [];

    for (const row of rows) {
      const categoryId = row.categoryName
        ? (categoriaPorNombre.get(row.categoryName.toUpperCase())?.id ?? null)
        : null;

      // Dejar la celda de proveedor vacia no desasigna al que ya tenia: quien quiera quitarlo lo
      // hace en la pantalla de proveedor habitual, no por omision en un archivo.
      const defaultSupplierId = row.supplierName
        ? (proveedorPorNombre.get(row.supplierName.toUpperCase())?.id ?? null)
        : null;

      const datos = {
        categoryId,
        baseUnit: row.baseUnit,
        yieldPercentage: row.yieldPercentage,
        targetStock: row.targetStock,
        presentationUnitLabel: row.presentationUnitLabel,
        presentationUnitQty: row.presentationUnitQty,
        ...(defaultSupplierId ? { defaultSupplierId } : {}),
      };

      const existente = existentePorNombre.get(row.name.toUpperCase());
      if (existente) {
        if (!actualizarExistentes) {
          omitidos.push({ name: row.name, excelRow: row.excelRow });
          continue;
        }
        porActualizar.push({ id: existente.id, data: datos });
        continue;
      }

      porCrear.push({
        organizationId: user.organizationId,
        name: row.name,
        defaultSupplierId,
        ...datos,
      });
    }

    if (porCrear.length > 0) {
      await prisma.product.createMany({ data: porCrear });
    }

    // Las actualizaciones van en lotes para no abrir una transaccion larguisima.
    const TAMANO_LOTE = 25;
    for (let i = 0; i < porActualizar.length; i += TAMANO_LOTE) {
      const lote = porActualizar.slice(i, i + TAMANO_LOTE);
      await prisma.$transaction(
        lote.map((u) => prisma.product.update({ where: { id: u.id }, data: u.data })),
      );
    }

    revalidatePath("/products");
    revalidatePath("/orders/new");
    return {
      result: {
        creados: porCrear.length,
        actualizados: porActualizar.length,
        omitidos,
        categoriasNuevas,
        proveedoresNuevos,
      },
    };
  } catch (error) {
    // Sin esto, cualquier fallo de base de datos tumbaba la pantalla sin decir nada.
    console.error("import-products error:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    return {
      message: `No se pudo guardar la carga. El sistema reporto: ${detalle.slice(0, 300)}`,
    };
  }
}
