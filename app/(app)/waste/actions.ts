"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { convertQty, removeYieldFactor, UNIT_META, UNITS, type UnitValue } from "@/lib/units";

type WasteRowInput = {
  productId: string;
  quantity: string;
  unit?: string;
  comment: string;
  costBasis?: string;
};

export async function createWasteEntries(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    const user = await requireOrgSession();

    const wasteDateRaw = String(formData.get("wasteDate") ?? "");
    const rowsRaw = String(formData.get("rows") ?? "[]");

    if (!wasteDateRaw) throw new Error("Indica la fecha de la merma.");

    let rows: WasteRowInput[];
    try {
      rows = JSON.parse(rowsRaw);
    } catch {
      throw new Error("Datos de merma invalidos.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Agrega al menos un producto.");
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, organizationId: user.organizationId },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    const wasteDate = new Date(wasteDateRaw);

    const toCreate = rows.map((row, index) => {
      const product = productById.get(row.productId);
      if (!product) throw new Error(`Selecciona un producto valido (fila ${index + 1}).`);

      const quantity = new Decimal(row.quantity || "0");
      if (quantity.lte(0)) {
        throw new Error(`La cantidad mermada de "${product.name}" debe ser mayor a cero.`);
      }

      const unit = (UNITS as readonly string[]).includes(row.unit ?? "")
        ? (row.unit as UnitValue)
        : (product.baseUnit as UnitValue);
      if (UNIT_META[unit].type !== UNIT_META[product.baseUnit as UnitValue].type) {
        throw new Error(`La unidad no es compatible con "${product.name}".`);
      }

      const costBasis = row.costBasis === "gross" ? "gross" : "net";
      const yieldPercentage = Number(product.yieldPercentage);
      const baseUnitCost =
        costBasis === "gross" && yieldPercentage !== 100
          ? removeYieldFactor(product.currentUnitCost, product.yieldPercentage)
          : new Decimal(product.currentUnitCost);
      const unitCost = convertQty(1, unit, product.baseUnit as UnitValue).times(baseUnitCost);

      return {
        organizationId: user.organizationId,
        productId: product.id,
        date: wasteDate,
        quantity: quantity.toString(),
        unit,
        unitCost: unitCost.toString(),
        costBasis,
        comment: row.comment.trim() || null,
        createdByUserId: user.id,
      };
    });

    await prisma.wasteEntry.createMany({ data: toCreate });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la merma." };
  }

  revalidatePath("/waste");
  revalidatePath("/dashboard");
  redirect("/waste");
}
