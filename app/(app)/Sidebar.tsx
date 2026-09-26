"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/**
 * Orden y agrupacion del menu lateral. Los modulos se acomodan por grupo segun su
 * seccion (primer segmento del href); los que no esten listados aqui caen en "Otros",
 * asi que agregar un panel nuevo nunca lo deja fuera del menu.
 */
const GROUPS: { title: string; sections: string[] }[] = [
  { title: "Operacion", sections: ["dashboard", "products", "recipes", "production", "inventory", "waste"] },
  { title: "Ventas", sections: ["sales", "orders", "store-orders"] },
  { title: "Compras", sections: ["purchases", "requisitions", "payments"] },
  { title: "Analisis", sections: ["planning", "menu-engineering", "audit"] },
  { title: "Sistema", sections: ["settings"] },
];

function sectionOf(href: string): string {
  return href.split("/")[1] ?? "";
}

/** Iconos de trazo, 20x20. Inline para no sumar una dependencia solo por esto. */
const ICONS: Record<string, string> = {
  dashboard: "M3 12h6v8H3zM10.5 4h3v16h-3zM15 9h6v11h-6z",
  products: "M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10",
  recipes: "M5 3h11l3 3v15H5zM9 8h7M9 12h7M9 16h4",
  production: "M3 20h18M5 20V9l5 3V9l5 3V6l4 2v12",
  inventory: "M3 8h18v12H3zM3 8l2-4h14l2 4M12 8v12",
  waste: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  sales: "M4 18l5-6 4 3 6-8M14 7h6v6",
  orders: "M6 4h12v16l-6-3-6 3zM9 9h6",
  "store-orders": "M4 9h16l-1 11H5zM8 9V6a4 4 0 018 0v3",
  purchases: "M3 5h3l2 11h11M8 20a1 1 0 100-2 1 1 0 000 2M18 20a1 1 0 100-2 1 1 0 000 2M9 9h11l-1 5H9",
  requisitions: "M4 8h12l-3-3M20 16H8l3 3",
  payments: "M3 7h18v10H3zM3 11h18M7 15h3",
  planning: "M4 19V5m0 14h16M8 15l4-5 3 3 5-7",
  "menu-engineering": "M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5z",
  audit: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 21l-4-4",
  settings:
    "M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4.4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.07-.4.1-.8.1-1.2z",
};

function NavIcon({ section }: { section: string }) {
  const path = ICONS[section] ?? "M5 12h14";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

export default function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const currentSection = pathname.split("/")[1] ?? "";

  const used = new Set<string>();
  const groups = GROUPS.map((group) => {
    const groupItems = group.sections
      .map((section) => items.find((item) => sectionOf(item.href) === section))
      .filter((item): item is NavItem => Boolean(item));
    groupItems.forEach((item) => used.add(sectionOf(item.href)));
    return { title: group.title, items: groupItems };
  }).filter((group) => group.items.length > 0);

  const leftovers = items.filter((item) => !used.has(sectionOf(item.href)));
  if (leftovers.length > 0) groups.push({ title: "Otros", items: leftovers });

  return (
    <>
      {/* Menu lateral (pantallas medianas en adelante) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-neutral-800 bg-neutral-900 lg:flex">
        <div className="flex h-16 items-center border-b border-neutral-800 px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 text-sm font-semibold text-white">
              M
            </span>
            <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-neutral-100">
              Menu Costeo
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group.title} className="mb-5 last:mb-0">
              <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = currentSection === sectionOf(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={
                          isActive
                            ? "relative flex items-center gap-2.5 rounded-md bg-neutral-800 px-2.5 py-2 text-sm font-medium text-white"
                            : "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
                        }
                      >
                        {isActive && (
                          <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r bg-brand-400" />
                        )}
                        <span className={isActive ? "text-brand-300" : "text-neutral-500"}>
                          <NavIcon section={sectionOf(item.href)} />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Navegacion compacta (moviles y tablets): misma lista, en tira horizontal */}
      <nav className="border-b border-neutral-200 bg-neutral-900 lg:hidden">
        <div className="flex items-center gap-1 overflow-x-auto px-4 py-2">
          {items.map((item) => {
            const isActive = currentSection === sectionOf(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "whitespace-nowrap rounded-md bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white"
                    : "whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
