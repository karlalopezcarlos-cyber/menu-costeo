import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrgSession } from "@/lib/tenant";
import SettingsNav from "../SettingsNav";
import IvaRateInput from "../IvaRateInput";
import { setSalesIvaRate } from "./actions";

export default async function TaxesPage() {
  const user = await requireOrgSession();

  const organization = await prisma.organization.findFirstOrThrow({
    where: { id: user.organizationId },
    select: { id: true, salesIvaRate: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Configuracion</h1>
        <SettingsNav active="/settings/taxes" />
        <p className="mt-3 text-sm text-neutral-500">
          El IVA se captura en tres lugares distintos porque son tres cosas distintas. Aqui vive
          el de las ventas, que es uno solo para todo el negocio.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">IVA de ventas</p>
            <p className="mt-0.5 text-sm text-neutral-500">
              Los precios de venta se capturan como vienen en la carta, con IVA incluido. Esta es
              la tasa que se les quita para leer la venta neta.
            </p>
          </div>
          <IvaRateInput
            id={organization.id}
            initialValue={organization.salesIvaRate.toString()}
            action={setSalesIvaRate}
          />
        </div>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Cambiar esta tasa cambia el Estado de Resultados de todos los periodos, no solo del que
          sigue. Es asi a proposito: no es un dato de cada venta, es como se lee el precio de
          carta.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-neutral-900">Los otros dos</p>
        <ul className="space-y-2 text-sm text-neutral-600">
          <li>
            <span className="font-medium text-neutral-800">IVA e IEPS de compras:</span> en cada
            producto, porque el limon y el tequila no pagan lo mismo. Se configura en{" "}
            <Link href="/products" className="text-brand-600 hover:underline">
              Productos
            </Link>
            . El precio de compra se captura sin impuesto y el IVA no entra al costo: es
            acreditable.
          </li>
          <li>
            <span className="font-medium text-neutral-800">IVA de gastos:</span> en cada tipo de
            gasto, porque la renta lo trae y la nomina no. Se configura en{" "}
            <Link href="/settings/expense-categories" className="text-brand-600 hover:underline">
              Tipos de gasto
            </Link>
            . El monto se captura con IVA, tal como viene el recibo.
          </li>
        </ul>
      </div>
    </div>
  );
}
