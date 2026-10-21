"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { Prisma } from "@/generated/prisma/client";

export type TemplateState = { error?: string };

type DatosPlantilla = {
  name: string;
  sourceProductId: string;
  outputs: { productId: string; refQtyPerUnit: string | null }[];
};

function parseTemplate(formData: FormData): DatosPlantilla {
  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  if (!sourceProductId) throw new Error("Elige el producto que entra.");

  const productIds = formData.getAll("outputProductId").map((v) => String(v).trim());
  const refs = formData.getAll("outputRefQty").map((v) => String(v).trim());

  const outputs: { productId: string; refQtyPerUnit: string | null }[] = [];
  const vistos = new Set<string>();
  productIds.forEach((productId, i) => {
    if (!productId) return;
    if (productId === sourceProductId) {
      throw new Error("Un producto no puede entrar y salir en la misma plantilla.");
    }
    if (vistos.has(productId)) {
      throw new Error("Hay un producto de salida repetido. Dejalo en un solo renglon.");
    }
    vistos.add(productId);

    let refQtyPerUnit: string | null = null;
    const raw = refs[i] ?? "";
    if (raw) {
      const valor = new Decimal(raw);
      if (valor.lte(0)) throw new Error("Lo que lleva cada unidad debe ser mayor a cero.");
      refQtyPerUnit = valor.toString();
    }
    outputs.push({ productId, refQtyPerUnit });
  });

  if (outputs.length === 0) throw new Error("Agrega al menos un producto que salga.");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle nombre a la plantilla.");

  return { name, sourceProductId, outputs };
}

export async function createTransformationTemplate(
  _prevState: TemplateState | undefined,
  formData: FormData,
): Promise<TemplateState> {
  try {
    const user = await requireOrgSession();
    const datos = parseTemplate(formData);

    await prisma.transformationTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: datos.name,
        sourceProductId: datos.sourceProductId,
        outputs: {
          create: datos.outputs.map((o, index) => ({
            productId: o.productId,
            refQtyPerUnit: o.refQtyPerUnit,
            sortOrder: index,
          })),
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una plantilla con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo crear la plantilla." };
  }

  revalidatePath("/portioning/templates");
  revalidatePath("/portioning/new");
  redirect("/portioning/templates");
}

export async function updateTransformationTemplate(
  templateId: string,
  _prevState: TemplateState | undefined,
  formData: FormData,
): Promise<TemplateState> {
  try {
    const user = await requireOrgSession();
    const datos = parseTemplate(formData);

    const existing = await prisma.transformationTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
    });
    if (!existing) throw new Error("Plantilla no encontrada.");

    // Las salidas se reemplazan completas: es mas simple y mas predecible que ir casando
    // renglon por renglon, y una plantilla no tiene historia que cuidar.
    await prisma.$transaction([
      prisma.transformationTemplateOutput.deleteMany({ where: { templateId } }),
      prisma.transformationTemplate.update({
        where: { id: templateId },
        data: {
          name: datos.name,
          sourceProductId: datos.sourceProductId,
          outputs: {
            create: datos.outputs.map((o, index) => ({
              productId: o.productId,
              refQtyPerUnit: o.refQtyPerUnit,
              sortOrder: index,
            })),
          },
        },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Ya existe una plantilla con ese nombre." };
    }
    return { error: error instanceof Error ? error.message : "No se pudo guardar la plantilla." };
  }

  revalidatePath("/portioning/templates");
  revalidatePath("/portioning/new");
  redirect("/portioning/templates");
}

/** Borrar una plantilla no toca ninguna transformacion ya registrada: solo deja de prellenar. */
export async function deleteTransformationTemplate(templateId: string) {
  const user = await requireOrgSession();

  const template = await prisma.transformationTemplate.findFirst({
    where: { id: templateId, organizationId: user.organizationId },
  });
  if (!template) throw new Error("Plantilla no encontrada.");

  await prisma.transformationTemplate.delete({ where: { id: template.id } });

  revalidatePath("/portioning/templates");
  revalidatePath("/portioning/new");
}
