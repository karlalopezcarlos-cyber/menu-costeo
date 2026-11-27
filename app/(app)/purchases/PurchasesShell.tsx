import Link from "next/link";

/** Encabezado y pestanas, compartidos por las dos vistas del modulo. */
export default function PurchasesShell({
  tab,
  children,
}: {
  tab: "productos" | "facturas" | "asociaciones";
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "productos", label: "Por producto", href: "/purchases" },
    { key: "facturas", label: "Por factura", href: "/purchases?tab=facturas" },
    { key: "asociaciones", label: "Asociaciones", href: "/purchases/asociaciones" },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Compras</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/purchases/import"
            className="rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
          >
            Subir XML o foto
          </Link>
          <Link
            href="/purchases/new"
            className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            Registrar compra
          </Link>
        </div>
      </div>

      <nav className="flex gap-4 border-b border-neutral-200 text-sm">
        {tabs.map((item) =>
          item.key === tab ? (
            <span
              key={item.key}
              className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="pb-2 text-neutral-500 transition-colors hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>

      {children}
    </div>
  );
}
