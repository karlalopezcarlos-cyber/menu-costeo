import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSucursalContext } from "@/lib/tenant";
import { loadTransformationProducts } from "@/lib/transformation-options";
import TemplateForm from "../../TemplateForm";
import { updateTransformationTemplate } from "../../actions";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const user = await requireSucursalContext();

  const [template, products] = await Promise.all([
    prisma.transformationTemplate.findFirst({
      where: { id: templateId, organizationId: user.organizationId },
      include: { outputs: { orderBy: { sortOrder: "asc" } } },
    }),
    loadTransformationProducts(user.organizationId, user.sucursalId),
  ]);
  if (!template) notFound();

  const updateWithId = updateTransformationTemplate.bind(null, template.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Editar plantilla</h1>
        <Link href="/portioning/templates" className="text-sm text-neutral-500 hover:underline">
          Volver
        </Link>
      </div>
      <TemplateForm
        action={updateWithId}
        products={products}
        values={{
          name: template.name,
          sourceProductId: template.sourceProductId,
          outputs: template.outputs.map((o) => ({
            productId: o.productId,
            refQtyPerUnit: o.refQtyPerUnit ? o.refQtyPerUnit.toString() : "",
          })),
        }}
        submitLabel="Guardar cambios"
      />
    </div>
  );
}
