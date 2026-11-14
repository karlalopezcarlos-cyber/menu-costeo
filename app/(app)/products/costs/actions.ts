"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { parseProductCostsWorkbook } from "@/lib/excel/import-product-costs";
import { normaliza, type RowError } from "@/lib/excel/import-name-cost";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";

/** Unidades donde un costo de centavos es lo esperado, no una senal de error. */
const UNIDADES_MENUDAS = new Set(["G", "ML"]);

export type ImportProductCostsState = {
  errors?: RowError[];
  /** Cuando el archivo trae varias columnas de costo: cuales son, para que el usuario elija. */
  costCandidates?: string[];
  /** Un problema general (archivo ilegible, sin encabezados), no de una fila. */
  message?: string;
  result?: {
    sucursalName: string;
    guardados: number;
    sinCambio: number;
    noEncontrados: { name: string; excelRow: number }[];
    /** Los que venian en $0 en el archivo. No se guardan: un cero no es un costo, es un dato
     *  que falta, y guardarlo taparia el costo del catalogo con nada. */
    enCero: { name: string; excelRow: number }[];
    /** Los que quedaron por debajo de $1 en su unidad base. Casi siempre significa que el
     *  archivo traia el precio por otra unidad (por mililitro en vez de por litro). */
    sospechosos: { name: string; costo: string; unidad: string }[];
    /** Cuantos productos quedaron costeados en cada unidad base, para cachar un archivo que
     *  venga en otra unidad que la del catalogo. */
    porUnidad: { unidad: string; cuantos: number }[];
    columnas: { name: string; cost: string } | null;
  };
};

/**
 * Carga masiva de costos de producto PARA LA SUCURSAL ACTIVA.
 *
 * No toca `Product.currentUnitCost`: ese campo es de toda la organizacion y escribir ahi el
 * costo de una sucursal se lo pondria a todas. Lo que se guarda es un SucursalProductCost, que
 * solo esta sucursal lee, y que queda por debajo de sus compras reales: el dia que capture una
 * compra del producto, la compra manda.
 *
 * Tampoco da de alta productos. Un costo sin producto no tiene donde vivir, y crear el producto
 * pide unidad base, categoria y rendimiento, que no estan en un archivo de costos. Los nombres
 * que no existen se reportan para darlos de alta en la carga masiva de productos.
 */
export async function importProductCosts(
  _prevState: ImportProductCostsState | undefined,
  formData: FormData,
): Promise<ImportProductCostsState> {
  const user = await requireSucursalContext();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Elige el archivo de Excel que quieres subir." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { message: "El archivo pesa mas de 5 MB. Subelo en dos partes." };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return { message: "No se pudo leer el archivo. Vuelve a elegirlo e intenta de nuevo." };
  }

  const costHeader = String(formData.get("costHeader") ?? "").trim() || undefined;
  const { rows, errors, columns, costCandidates } = await parseProductCostsWorkbook(buffer, costHeader);
  if (errors.length > 0) return { errors, costCandidates };
  if (rows.length === 0) {
    return { message: "El archivo no trae ningun costo. Revisa que la columna de costo tenga datos." };
  }

  try {
    const sucursal = await prisma.sucursal.findUniqueOrThrow({
      where: { id: user.sucursalId },
      select: { name: true },
    });

    const productos = await prisma.product.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, baseUnit: true },
    });
    const porNombre = new Map(productos.map((p) => [normaliza(p.name), p]));

    const previos = await prisma.sucursalProductCost.findMany({
      where: { sucursalId: user.sucursalId },
      select: { productId: true, unitCost: true },
    });
    const previoPorProducto = new Map(previos.map((c) => [c.productId, c.unitCost]));

    const noEncontrados: { name: string; excelRow: number }[] = [];
    const enCero: { name: string; excelRow: number }[] = [];
    const sospechosos: { name: string; costo: string; unidad: string }[] = [];
    const porGuardar: { productId: string; cost: string }[] = [];
    const unidades = new Map<string, number>();
    let sinCambio = 0;

    for (const row of rows) {
      // Un cero no es un costo, es un dato que falta. Guardarlo taparia el costo del catalogo
      // con nada y dejaria la receta costeando en $0 sin que se note.
      if (row.cost.isZero()) {
        enCero.push({ name: row.name, excelRow: row.excelRow });
        continue;
      }
      const producto = porNombre.get(normaliza(row.name));
      if (!producto) {
        noEncontrados.push({ name: row.name, excelRow: row.excelRow });
        continue;
      }
      const etiqueta = UNIT_LABELS[producto.baseUnit as UnitValue] ?? producto.baseUnit;
      // Menos de un peso solo es raro en las unidades grandes. En gramo y mililitro es lo
      // normal -un destilado a $0.50 el ml es una botella de $375- y avisarlo ahi seria gritar
      // en cada renglon de la barra hasta que nadie lea los avisos.
      if (row.cost.lt(1) && !UNIDADES_MENUDAS.has(producto.baseUnit)) {
        sospechosos.push({ name: producto.name, costo: row.cost.toFixed(4), unidad: etiqueta });
      }
      const previo = previoPorProducto.get(producto.id);
      if (previo !== undefined && row.cost.equals(previo.toString())) {
        sinCambio++;
        continue;
      }
      porGuardar.push({ productId: producto.id, cost: row.cost.toString() });
      unidades.set(etiqueta, (unidades.get(etiqueta) ?? 0) + 1);
    }

    // En lotes, para no abrir una transaccion larguisima con cientos de productos.
    const TAMANO_LOTE = 25;
    for (let i = 0; i < porGuardar.length; i += TAMANO_LOTE) {
      const lote = porGuardar.slice(i, i + TAMANO_LOTE);
      await prisma.$transaction(
        lote.map((u) =>
          prisma.sucursalProductCost.upsert({
            where: { sucursalId_productId: { sucursalId: user.sucursalId, productId: u.productId } },
            create: { sucursalId: user.sucursalId, productId: u.productId, unitCost: u.cost, source: "import" },
            update: { unitCost: u.cost, source: "import" },
          }),
        ),
      );
    }

    revalidatePath("/products");
    revalidatePath("/recipes");
    revalidatePath("/menu-engineering");
    revalidatePath("/dashboard");
    return {
      result: {
        sucursalName: sucursal.name,
        guardados: porGuardar.length,
        sinCambio,
        noEncontrados,
        enCero,
        sospechosos,
        porUnidad: [...unidades.entries()]
          .map(([unidad, cuantos]) => ({ unidad, cuantos }))
          .sort((a, b) => b.cuantos - a.cuantos),
        columnas: columns,
      },
    };
  } catch (error) {
    console.error("import-product-costs error:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    return { message: `No se pudo guardar la carga. El sistema reporto: ${detalle.slice(0, 300)}` };
  }
}
