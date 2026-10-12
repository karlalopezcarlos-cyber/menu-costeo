import Link from "next/link";
import { requireOrgSession } from "@/lib/tenant";
import ImportProductsForm from "./ImportProductsForm";

export default async function ImportProductsPage() {
  await requireOrgSession();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">Productos</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900">Carga masiva</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Da de alta cientos de productos de una vez, desde un Excel.
          </p>
        </div>
        <Link href="/products" className="text-sm font-medium text-neutral-500 transition-colors hover:text-brand-600">
          Volver al catalogo
        </Link>
      </div>

      <ImportProductsForm />
    </div>
  );
}
