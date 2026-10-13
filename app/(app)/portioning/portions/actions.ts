"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { UNITS, UNIT_META, UNIT_LABELS, type UnitValue } from "@/lib/units";

export type PortionState = { error?: string };

function parseUnit(value: FormDataEntryValue | null): UnitValue {
  const raw = String(value ?? "");
  if ((UNITS as readonly string[]).includes(raw)) return raw as UnitValue;
  throw new Error("Unidad invalida.");
}

/**
 * Alta de una porcion.
 *
 * Por dentro una porcion es una receta marcada como `isPortion` que rinde 1 PZA: eso es lo que
 * le permite llevar varios ingredientes (sal, limon, bolsa) y recostearse sola cuando suben los
 * precios. Pero el usuario no tiene por que saberlo: aqui captura "una porcion de camaron de
 * 20 g, mas sal y una bolsa" en una sola pantalla.
 */
type ParsedPortion = {
  name: string;
  pedidos: { productId: string; qty: Decimal; unit: UnitValue }[];
};

/** Validacion compartida por el alta y la edicion de una porcion. */
async function parsePortionForm(
  organizationId: string,
  formData: FormData,
): Promise<ParsedPortion | { error: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Ponle nombre a la porcion, por ejemplo CAMARON 20 G." };

  const parentProductId = String(formData.get("parentProductId") ?? "").trim();
  if (!parentProductId) return { error: "Elige el producto del que sale esta porcion." };

  const parentQty = new Decimal(String(formData.get("parentQty") ?? "0"));
  if (parentQty.lte(0)) return { error: "Captura cuanto producto lleva una porcion." };
  const parentUnit = parseUnit(formData.get("parentUnit"));

  const extraIds = formData.getAll("extraProductId").map((v) => String(v).trim());
  const extraQtys = formData.getAll("extraQty").map((v) => String(v).trim());
  const extraUnits = formData.getAll("extraUnit").map((v) => String(v));

  const pedidos = [
    { productId: parentProductId, qty: parentQty, unit: parentUnit },
    ...extraIds
      .map((productId, i) => ({ productId, qtyRaw: extraQtys[i] ?? "", unitRaw: extraUnits[i] }))
      .filter((e) => e.productId && e.qtyRaw)
      .map((e) => ({ productId: e.productId, qty: new Decimal(e.qtyRaw), unit: parseUnit(e.unitRaw) })),
  ];

  const productos = await prisma.product.findMany({
    where: { id: { in: pedidos.map((p) => p.productId) }, organizationId },
    select: { id: true, name: true, baseUnit: true },
  });
  const productoPorId = new Map(productos.map((p) => [p.id, p]));

  const vistos = new Set<string>();
  for (const pedido of pedidos) {
    const producto = productoPorId.get(pedido.productId);
    if (!producto) return { error: "Uno de los ingredientes no existe o no es de tu organizacion." };
    if (pedido.qty.lte(0)) return { error: `La cantidad de ${producto.name} debe ser mayor a cero.` };
    // La unidad debe ser del mismo tipo que la del producto: un producto en kilos no se captura
    // en litros.
    if (UNIT_META[pedido.unit].type !== UNIT_META[producto.baseUnit as UnitValue].type) {
      return {
        error: `${producto.name} se mide en ${UNIT_LABELS[producto.baseUnit as UnitValue]}, asi que no se puede capturar en ${UNIT_LABELS[pedido.unit]}.`,
      };
    }
    if (vistos.has(pedido.productId)) {
      return { error: `${producto.name} esta repetido entre los ingredientes.` };
    }
    vistos.add(pedido.productId);
  }

  return { name, pedidos };
}

/**
 * Alta de una porcion.
 *
 * Por dentro una porcion es una receta marcada como `isPortion` que rinde 1 PZA: eso es lo que
 * le permite llevar varios ingredientes (sal, limon, bolsa) y recostearse sola cuando suben los
 * precios. Pero el usuario no tiene por que saberlo: aqui captura "una porcion de camaron de
 * 20 g, mas sal y una bolsa" en una sola pantalla.
 */
export async function createPortion(
  _prevState: PortionState | undefined,
  formData: FormData,
): Promise<PortionState> {
  let recipeId: string;

  try {
    const user = await requireSucursalContext();

    const parsed = await parsePortionForm(user.organizationId, formData);
    if ("error" in parsed) return { error: parsed.error };

    const duplicate = await prisma.recipe.findFirst({
      where: { sucursalId: user.sucursalId, name: { equals: parsed.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) return { error: `Ya existe una receta o porcion con el nombre "${parsed.name}".` };

    const recipe = await prisma.recipe.create({
      data: {
        organizationId: user.organizationId,
        sucursalId: user.sucursalId,
        name: parsed.name,
        // Una porcion rinde una pieza: por eso las porciones se cuentan por pieza.
        yieldQty: "1",
        yieldUnit: "PIECE",
        isPortion: true,
        isMenuItem: false,
        items: {
          create: parsed.pedidos.map((pedido, index) => ({
            productId: pedido.productId,
            quantity: pedido.qty.toString(),
            unit: pedido.unit,
            sortOrder: index,
          })),
        },
      },
      select: { id: true },
    });
    recipeId = recipe.id;
  } catch (error) {
    console.error("createPortion error:", error);
    return { error: error instanceof Error ? error.message.slice(0, 200) : "No se pudo crear la porcion." };
  }

  revalidatePath("/portioning/portions");
  revalidatePath("/recipes");
  redirect(`/portioning/portions`);
}

export async function updatePortion(
  recipeId: string,
  _prevState: PortionState | undefined,
  formData: FormData,
): Promise<PortionState> {
  try {
    const user = await requireSucursalContext();

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, sucursalId: user.sucursalId, isPortion: true },
      select: { id: true },
    });
    if (!recipe) return { error: "La porcion no existe o no es de esta sucursal." };

    const parsed = await parsePortionForm(user.organizationId, formData);
    if ("error" in parsed) return { error: parsed.error };

    const duplicate = await prisma.recipe.findFirst({
      where: {
        sucursalId: user.sucursalId,
        name: { equals: parsed.name, mode: "insensitive" },
        id: { not: recipeId },
      },
      select: { id: true },
    });
    if (duplicate) return { error: `Ya existe una receta o porcion con el nombre "${parsed.name}".` };

    await prisma.$transaction([
      prisma.recipeItem.deleteMany({ where: { recipeId } }),
      prisma.recipe.update({
        where: { id: recipeId },
        data: {
          name: parsed.name,
          items: {
            create: parsed.pedidos.map((pedido, index) => ({
              productId: pedido.productId,
              quantity: pedido.qty.toString(),
              unit: pedido.unit,
              sortOrder: index,
            })),
          },
        },
      }),
    ]);
  } catch (error) {
    console.error("updatePortion error:", error);
    return { error: error instanceof Error ? error.message.slice(0, 200) : "No se pudo guardar la porcion." };
  }

  revalidatePath("/portioning/portions");
  revalidatePath("/recipes");
  redirect("/portioning/portions");
}

export type DeletePortionResult = { deleted?: boolean; archived?: boolean; error?: string };

/**
 * Borra una porcion, o la archiva si ya tiene historial.
 *
 * Borrarla de raiz cuando ya aparece en porcionamientos registrados dejaria esos registros sin
 * referencia: el historial diria "salieron 25 piezas de algo que ya no existe". En ese caso se
 * archiva, que la saca de las listas pero conserva lo capturado.
 */
export async function deletePortion(recipeId: string): Promise<DeletePortionResult> {
  try {
    const user = await requireSucursalContext();

    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, sucursalId: user.sucursalId, isPortion: true },
      select: { id: true, name: true },
    });
    if (!recipe) return { error: "La porcion no existe o no es de esta sucursal." };

    const [enPorcionamientos, comoSubreceta, enVentas, enConteos, enMermas, enProduccion] =
      await Promise.all([
        prisma.portioningOutput.count({ where: { recipeId } }),
        prisma.recipeItem.count({ where: { subRecipeId: recipeId } }),
        prisma.dailySale.count({ where: { recipeId } }),
        prisma.inventoryCountItem.count({ where: { subRecipeId: recipeId } }),
        prisma.wasteEntry.count({ where: { subRecipeId: recipeId } }),
        prisma.productionEntry.count({ where: { subRecipeId: recipeId } }),
      ]);

    const tieneHistorial =
      enPorcionamientos + comoSubreceta + enVentas + enConteos + enMermas + enProduccion > 0;

    if (tieneHistorial) {
      await prisma.recipe.update({ where: { id: recipeId }, data: { archivedAt: new Date() } });
      revalidatePath("/portioning/portions");
      revalidatePath("/recipes");
      return { archived: true };
    }

    await prisma.recipe.delete({ where: { id: recipeId } });
    revalidatePath("/portioning/portions");
    revalidatePath("/recipes");
    return { deleted: true };
  } catch (error) {
    console.error("deletePortion error:", error);
    return { error: error instanceof Error ? error.message.slice(0, 200) : "No se pudo borrar la porcion." };
  }
}
