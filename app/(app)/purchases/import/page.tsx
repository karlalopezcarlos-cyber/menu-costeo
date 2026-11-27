import Link from "next/link";
import { requireSucursalContext } from "@/lib/tenant";
import { cargarCatalogoDeCompras } from "@/lib/compras/catalogo";
import SubirDocumento from "./SubirDocumento";

export default async function ImportarCompraPage() {
  const user = await requireSucursalContext();

  const { productos, proveedores } = await cargarCatalogoDeCompras(user.organizationId);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Compras
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">
            Subir una compra
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            El XML de la factura, o la foto de la nota de papel. Las dos llegan a la misma
            pantalla de revision y nada se guarda hasta que lo confirmas.
          </p>
        </div>
        <Link
          href="/purchases"
          className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600"
        >
          Volver a compras
        </Link>
      </div>

      <SubirDocumento
        productos={productos}
        proveedores={proveedores}
        iaDisponible={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
