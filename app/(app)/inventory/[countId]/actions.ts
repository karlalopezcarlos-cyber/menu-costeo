"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadOrgRecipeGraph, getRecipeCost, getSucursalProductCosts, type RecipeGraph } from "@/lib/costing";
import { removeYieldFactor } from "@/lib/units";
import { parseCountWorkbook } from "@/lib/excel/import-count";
import { normaliza as normalizaNombre } from "@/lib/excel/import-name-cost";

async function getCount(countId: string, sucursalId: string) {
  const count = await prisma.inventoryCount.findFirst({ where: { id: countId, sucursalId } });
  if (!count) throw new Error("Conteo de inventario no encontrado.");
  return count;
}

function subRecipeUnitCost(graph: RecipeGraph, memo: Map<string, Decimal>, recipeId: string): Decimal {
  const node = graph.recipes.get(recipeId);
  if (!node || node.yieldQty.isZero()) return new Decimal(0);
  return getRecipeCost(recipeId, graph, memo).dividedBy(node.yieldQty);
}

export type InventoryCaptureEntry = {
  type: "product" | "subrecipe";
  id: string;
  quantity: string;
  costBasis?: string;
};

/**
 * Logica compartida por el guardado manual (boton "Guardar conteo") y el autoguardado en
 * segundo plano: recibe la lista completa de renglones capturados y hace upsert/delete de cada
 * InventoryCountItem segun corresponda. Cantidad vacia o 0 borra el renglon (si existia); cantidad
 * > 0 crea/actualiza con el costo unitario vigente segun la base elegida (solo aplica a productos
 * con rendimiento < 100%, ej. "gross" = costo de compra del aguacate entero sin pelar).
 */
async function persistInventoryCount(
  countId: string,
  organizationId: string,
  sucursalId: string,
  userId: string | null,
  entries: InventoryCaptureEntry[],
) {
  const count = await getCount(countId, sucursalId);

  // Solo se carga lo que tocan estas entradas, no el catalogo entero.
  //
  // Esto importa porque el autoguardado corre cada par de segundos mientras se captura: cargar
  // todos los productos, todas sus compras historicas y el grafo completo de recetas en cada
  // vuelta hacia que el conteo se volviera mas lento conforme crecia, hasta tronar con "error al
  // autoguardar" justo cuando ya llevabas media captura hecha.
  const productIds = [...new Set(entries.filter((e) => e.type === "product").map((e) => e.id))];
  const subRecipeIds = [...new Set(entries.filter((e) => e.type === "subrecipe").map((e) => e.id))];

  const [products, subRecipes, graph, existingItems] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { organizationId, archivedAt: null, id: { in: productIds } },
        })
      : Promise.resolve([]),
    subRecipeIds.length
      ? prisma.recipe.findMany({
          where: { sucursalId, archivedAt: null, isMenuItem: false, id: { in: subRecipeIds } },
        })
      : Promise.resolve([]),
    // El grafo de recetas solo hace falta para costear subrecetas.
    subRecipeIds.length ? loadOrgRecipeGraph(sucursalId) : Promise.resolve(null),
    prisma.inventoryCountItem.findMany({
      where: {
        inventoryCountId: count.id,
        OR: [
          ...(productIds.length ? [{ productId: { in: productIds } }] : []),
          ...(subRecipeIds.length ? [{ subRecipeId: { in: subRecipeIds } }] : []),
        ],
      },
    }),
  ]);
  const productCosts = await getSucursalProductCosts(
    sucursalId,
    products.map((p) => p.id),
  );
  const productById = new Map(products.map((p) => [p.id, p]));
  const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));
  const existingByProductId = new Map(
    existingItems.filter((i) => i.productId).map((i) => [i.productId as string, i]),
  );
  const existingBySubRecipeId = new Map(
    existingItems.filter((i) => i.subRecipeId).map((i) => [i.subRecipeId as string, i]),
  );
  const memo = new Map<string, Decimal>();

  const toUpsertProduct: { id: string; quantity: string; costBasis: string }[] = [];
  const toUpsertSubRecipe: { id: string; quantity: string }[] = [];
  const toDeleteProductIds: string[] = [];
  const toDeleteSubRecipeIds: string[] = [];
  const changeLogs: {
    productId: string | null;
    subRecipeId: string | null;
    previousQuantity: string | null;
    newQuantity: string;
  }[] = [];

  for (const entry of entries) {
    const raw = entry.quantity.trim();
    let quantity: Decimal;
    try {
      quantity = new Decimal(raw || "0");
    } catch {
      continue;
    }

    if (entry.type === "product" && productById.has(entry.id)) {
      const existing = existingByProductId.get(entry.id);
      if (quantity.lte(0)) {
        if (existing) {
          toDeleteProductIds.push(entry.id);
          changeLogs.push({
            productId: entry.id,
            subRecipeId: null,
            previousQuantity: existing.quantity.toString(),
            newQuantity: "0",
          });
        }
      } else {
        const costBasis = entry.costBasis === "gross" ? "gross" : "net";
        toUpsertProduct.push({ id: entry.id, quantity: quantity.toString(), costBasis });
        if (!existing || !existing.quantity.equals(quantity)) {
          changeLogs.push({
            productId: entry.id,
            subRecipeId: null,
            previousQuantity: existing ? existing.quantity.toString() : null,
            newQuantity: quantity.toString(),
          });
        }
      }
    } else if (entry.type === "subrecipe" && subRecipeById.has(entry.id)) {
      const existing = existingBySubRecipeId.get(entry.id);
      if (quantity.lte(0)) {
        if (existing) {
          toDeleteSubRecipeIds.push(entry.id);
          changeLogs.push({
            productId: null,
            subRecipeId: entry.id,
            previousQuantity: existing.quantity.toString(),
            newQuantity: "0",
          });
        }
      } else {
        toUpsertSubRecipe.push({ id: entry.id, quantity: quantity.toString() });
        if (!existing || !existing.quantity.equals(quantity)) {
          changeLogs.push({
            productId: null,
            subRecipeId: entry.id,
            previousQuantity: existing ? existing.quantity.toString() : null,
            newQuantity: quantity.toString(),
          });
        }
      }
    }
  }

  const operaciones = [
    ...toUpsertProduct.map(({ id, quantity, costBasis }) => {
      const product = productById.get(id)!;
      const netCost = productCosts.get(id) ?? new Decimal(0);
      const unitCost =
        costBasis === "gross" ? removeYieldFactor(netCost, product.yieldPercentage) : netCost;
      return prisma.inventoryCountItem.upsert({
        where: { inventoryCountId_productId: { inventoryCountId: count.id, productId: id } },
        create: {
          inventoryCountId: count.id,
          productId: id,
          quantity,
          unit: product.baseUnit,
          unitCost: unitCost.toString(),
          costBasis,
        },
        update: { quantity, unit: product.baseUnit, unitCost: unitCost.toString(), costBasis },
      });
    }),
    ...toUpsertSubRecipe.map(({ id, quantity }) => {
      const subRecipe = subRecipeById.get(id)!;
      const unitCost = graph ? subRecipeUnitCost(graph, memo, id) : new Decimal(0);
      return prisma.inventoryCountItem.upsert({
        where: { inventoryCountId_subRecipeId: { inventoryCountId: count.id, subRecipeId: id } },
        create: {
          inventoryCountId: count.id,
          subRecipeId: id,
          quantity,
          unit: subRecipe.yieldUnit,
          unitCost: unitCost.toString(),
        },
        update: { quantity, unit: subRecipe.yieldUnit, unitCost: unitCost.toString() },
      });
    }),
    ...(toDeleteProductIds.length
      ? [
          prisma.inventoryCountItem.deleteMany({
            where: { inventoryCountId: count.id, productId: { in: toDeleteProductIds } },
          }),
        ]
      : []),
    ...(toDeleteSubRecipeIds.length
      ? [
          prisma.inventoryCountItem.deleteMany({
            where: { inventoryCountId: count.id, subRecipeId: { in: toDeleteSubRecipeIds } },
          }),
        ]
      : []),
    ...changeLogs.map((log) =>
      prisma.inventoryCountItemChange.create({
        data: {
          organizationId,
          sucursalId,
          inventoryCountId: count.id,
          productId: log.productId,
          subRecipeId: log.subRecipeId,
          previousQuantity: log.previousQuantity,
          newQuantity: log.newQuantity,
          changedByUserId: userId,
        },
      }),
    ),
  ];

  if (operaciones.length === 0) return;
  await prisma.$transaction(operaciones);
}

export async function saveInventoryCount(countId: string, formData: FormData) {
  const user = await requireSucursalContext();

  const basisByProductId = new Map<string, string>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("basis:product:")) continue;
    const id = key.slice("basis:product:".length);
    basisByProductId.set(id, String(rawValue));
  }

  const entries: InventoryCaptureEntry[] = [];
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("qty:")) continue;
    const [, type, id] = key.split(":");
    if (type !== "product" && type !== "subrecipe") continue;
    entries.push({ type, id, quantity: String(rawValue), costBasis: basisByProductId.get(id) });
  }

  await persistInventoryCount(countId, user.organizationId, user.sucursalId, user.id, entries);

  revalidatePath(`/inventory/${countId}`);
  revalidatePath("/inventory");
}

/**
 * Autoguardado silencioso en segundo plano (sin redirect ni revalidatePath, para no interrumpir
 * la captura en curso): protege contra perder la captura si se va la luz o se cierra el navegador
 * antes de dar click en "Guardar conteo".
 */
export async function autoSaveInventoryCount(
  countId: string,
  entries: InventoryCaptureEntry[],
): Promise<{ savedAt: string } | { error: string }> {
  try {
    const user = await requireSucursalContext();
    await persistInventoryCount(countId, user.organizationId, user.sucursalId, user.id, entries);
    return { savedAt: new Date().toISOString() };
  } catch (error) {
    console.error("autoSaveInventoryCount error:", error);
    return {
      error: error instanceof Error ? error.message.slice(0, 200) : "No se pudo autoguardar.",
    };
  }
}

export type ImportCountState = {
  errors?: { excelRow: number; message: string }[];
  /** Cuando el archivo trae varias columnas candidatas: cuales son, para que el usuario elija. */
  valueCandidates?: string[];
  message?: string;
  result?: {
    cargados: number;
    noEncontrados: { name: string; excelRow: number }[];
    /** Cantidades de cero o menos. No entran: el conteo las lee como "borra este renglon", y
     *  un inventario fisico negativo no es un conteo, es un descuadre del otro sistema. */
    noPositivos: { name: string; cantidad: string; excelRow: number }[];
    columnas: { name: string; cost: string } | null;
  };
};

/**
 * Carga masiva de un conteo de inventario desde el Excel que el restaurante ya tiene.
 *
 * Se apoya en persistInventoryCount, el mismo camino que usan la captura en pantalla y el
 * autoguardado: asi la carga congela el costo unitario igual, deja la misma bitacora de cambios
 * y no inventa una segunda forma de escribir un conteo.
 *
 * Solo toca los renglones que vienen en el archivo. Lo que ya estaba capturado y no aparece se
 * queda como estaba, porque subir la lista de un almacen no debe borrar la de otro.
 */
export async function importInventoryCount(
  countId: string,
  _prevState: ImportCountState | undefined,
  formData: FormData,
): Promise<ImportCountState> {
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

  const valueHeader = String(formData.get("valueHeader") ?? "").trim() || undefined;
  const { rows, errors, columns, costCandidates } = await parseCountWorkbook(buffer, valueHeader);
  if (errors.length > 0) return { errors, valueCandidates: costCandidates };
  if (rows.length === 0) {
    return { message: "El archivo no trae ninguna cantidad. Revisa que la columna del conteo tenga datos." };
  }

  try {
    await getCount(countId, user.sucursalId);

    const [productos, subrecetas] = await Promise.all([
      prisma.product.findMany({
        where: { organizationId: user.organizationId, archivedAt: null },
        select: { id: true, name: true },
      }),
      prisma.recipe.findMany({
        where: { sucursalId: user.sucursalId, archivedAt: null, isMenuItem: false },
        select: { id: true, name: true },
      }),
    ]);
    const productoPorNombre = new Map(productos.map((p) => [normalizaNombre(p.name), p]));
    const subrecetaPorNombre = new Map(subrecetas.map((r) => [normalizaNombre(r.name), r]));

    const entries: InventoryCaptureEntry[] = [];
    const noEncontrados: { name: string; excelRow: number }[] = [];
    const noPositivos: { name: string; cantidad: string; excelRow: number }[] = [];

    for (const row of rows) {
      if (row.cost.lte(0)) {
        noPositivos.push({ name: row.name, cantidad: row.cost.toString(), excelRow: row.excelRow });
        continue;
      }
      const clave = normalizaNombre(row.name);
      const producto = productoPorNombre.get(clave);
      if (producto) {
        entries.push({ type: "product", id: producto.id, quantity: row.cost.toString() });
        continue;
      }
      const subreceta = subrecetaPorNombre.get(clave);
      if (subreceta) {
        entries.push({ type: "subrecipe", id: subreceta.id, quantity: row.cost.toString() });
        continue;
      }
      noEncontrados.push({ name: row.name, excelRow: row.excelRow });
    }

    if (entries.length > 0) {
      await persistInventoryCount(countId, user.organizationId, user.sucursalId, user.id, entries);
    }

    revalidatePath(`/inventory/${countId}`);
    revalidatePath("/inventory");
    return {
      result: { cargados: entries.length, noEncontrados, noPositivos, columnas: columns },
    };
  } catch (error) {
    console.error("import-inventory-count error:", error);
    const detalle = error instanceof Error ? error.message : String(error);
    return { message: `No se pudo guardar la carga. El sistema reporto: ${detalle.slice(0, 300)}` };
  }
}
