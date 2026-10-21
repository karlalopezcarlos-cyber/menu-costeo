import Link from "next/link";
import { requireSucursalContext } from "@/lib/tenant";
import { loadTransformationProducts } from "@/lib/transformation-options";
import TemplateForm from "../TemplateForm";
import { createTransformationTemplate } from "../actions";

export default async function NewTemplatePage() {
  const user = await requireSucursalContext();
  const products = await loadTransformationProducts(user.organizationId, user.sucursalId);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Nueva plantilla</h1>
        <Link href="/portioning/templates" className="text-sm text-neutral-500 hover:underline">
          Volver
        </Link>
      </div>
      <TemplateForm
        action={createTransformationTemplate}
        products={products}
        submitLabel="Crear plantilla"
      />
    </div>
  );
}
