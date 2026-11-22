import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import { faltantesFiscales } from "@/lib/cfdi";
import SettingsNav from "../SettingsNav";
import DatosFiscalesManager, { type SucursalFiscal } from "./DatosFiscalesManager";

export default async function FiscalPage() {
  const user = await requireOrgSession();

  const sucursales = await prisma.sucursal.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ isCentral: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isCentral: true,
      rfc: true,
      razonSocial: true,
      regimenFiscal: true,
      codigoPostalFiscal: true,
      usoCfdi: true,
    },
  });

  const rows: SucursalFiscal[] = sucursales.map((s) => ({
    ...s,
    // Como emisor y como receptor piden cosas distintas; una sucursal que factura y recibe
    // necesita las dos, asi que se califica con la exigencia mas alta.
    faltantes: faltantesFiscales(s, true),
  }));

  // Dos sucursales con el mismo RFC no se pueden facturar entre si: el SAT no acepta un CFDI
  // donde el emisor y el receptor son el mismo contribuyente. Vale la pena decirlo aqui y no
  // cuando el timbre sea rechazado.
  const porRfc = new Map<string, string[]>();
  for (const s of sucursales) {
    if (!s.rfc) continue;
    porRfc.set(s.rfc, [...(porRfc.get(s.rfc) ?? []), s.name]);
  }
  const rfcCompartidos = [...porRfc.entries()].filter(([, nombres]) => nombres.length > 1);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/fiscal" />
        <p className="mt-3 text-sm text-neutral-500">
          Datos fiscales de cada sucursal, para poder facturar un traspaso entre dos que tienen
          RFC distinto. Captura la razon social y el regimen tal como vienen en la Constancia de
          Situacion Fiscal: el SAT los compara caracter por caracter.
        </p>
      </div>

      {rfcCompartidos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Hay sucursales que comparten RFC.</p>
          <ul className="mt-1 list-disc pl-5 text-amber-800">
            {rfcCompartidos.map(([rfc, nombres]) => (
              <li key={rfc}>
                {rfc}: {nombres.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-amber-800">
            Entre esas no hay factura posible: un CFDI necesita que el emisor y el receptor sean
            contribuyentes distintos. Sus traspasos se quedan como cifra de control interno.
          </p>
        </div>
      )}

      {user.role !== "OWNER" ? (
        <p className="text-sm text-neutral-500">
          Solo el dueno de la cuenta puede editar los datos fiscales.
        </p>
      ) : (
        <DatosFiscalesManager sucursales={rows} />
      )}
    </div>
  );
}
