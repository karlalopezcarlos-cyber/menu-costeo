import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { UNIT_LABELS, type UnitValue } from "@/lib/units";
import TemplateRowActions from "./TemplateRowActions";

export default async function TransformationTemplatesPage() {
  const user = await requireOrgSession();

  const templates = await prisma.transformationTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    include: {
      sourceProduct: { select: { name: true, baseUnit: true } },
      outputs: {
        orderBy: { sortOrder: "asc" },
        include: { product: { select: { name: true, baseUnit: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Operacion</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Plantillas de transformacion
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-500">
            De que producto sale que producto. Las mismas transformaciones se repiten todos los
            dias: dejandolas guardadas, registrar una es elegir la plantilla y teclear cuanto
            entro y cuanto salio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/portioning" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
            Transformaciones
          </Link>
          <Link
            href="/portioning/templates/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Nueva plantilla
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Plantilla</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Entra</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Sale</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Todavia no hay plantillas. Crea las dos o tres que haces siempre (CAMARON →
                  CAMARON LIMPIO, CAMARON LIMPIO → CAMARON 20 G) y apareceran al registrar una
                  transformacion.
                </td>
              </tr>
            )}
            {templates.map((template) => (
              <tr key={template.id} className="border-t border-neutral-100 align-top transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/portioning/templates/${template.id}/edit`}
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    {template.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {template.sourceProduct.name}
                  <span className="text-neutral-400">
                    {" "}
                    ({UNIT_LABELS[template.sourceProduct.baseUnit as UnitValue]})
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {template.outputs.map((output) => (
                    <p key={output.id}>
                      {output.product.name}
                      <span className="text-neutral-400">
                        {" "}
                        ({UNIT_LABELS[output.product.baseUnit as UnitValue]})
                      </span>
                      {output.refQtyPerUnit && (
                        <span className="text-neutral-400">
                          {" · "}
                          {Number(output.refQtyPerUnit).toLocaleString("es-MX", {
                            maximumFractionDigits: 6,
                          })}{" "}
                          {UNIT_LABELS[template.sourceProduct.baseUnit as UnitValue]} c/u
                        </span>
                      )}
                    </p>
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  <TemplateRowActions templateId={template.id} name={template.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
