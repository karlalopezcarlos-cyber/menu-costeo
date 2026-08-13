import Link from "next/link";

const TABS = [
  { href: "/settings/categories", label: "Categorias de productos" },
  { href: "/settings/recipe-categories", label: "Categorias de recetas" },
  { href: "/settings/suppliers", label: "Proveedores" },
  { href: "/settings/sucursales", label: "Sucursales" },
  { href: "/settings/store", label: "Tienda en linea" },
  { href: "/settings/users", label: "Usuarios" },
];

export default function SettingsNav({ active }: { active: string }) {
  return (
    <nav className="mt-3 flex gap-4 border-b border-neutral-200 text-sm">
      {TABS.map((tab) =>
        tab.href === active ? (
          <span key={tab.href} className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900">
            {tab.label}
          </span>
        ) : (
          <Link key={tab.href} href={tab.href} className="pb-2 text-neutral-500 hover:text-neutral-900">
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
