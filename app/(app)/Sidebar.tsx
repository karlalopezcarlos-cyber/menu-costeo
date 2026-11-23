"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FondoBadge } from "@/components/brand/FondoLogo";

export type NavItem = { href: string; label: string };

/**
 * Orden y agrupacion del menu lateral. Los modulos se acomodan por grupo segun su
 * seccion (primer segmento del href); los que no esten listados aqui caen en "Otros",
 * asi que agregar un panel nuevo nunca lo deja fuera del menu.
 */
const GROUPS: { title: string; sections: string[] }[] = [
  { title: "Operacion", sections: ["dashboard", "products", "recipes", "costeador", "production", "portioning", "inventory", "waste"] },
  { title: "Ventas", sections: ["sales", "internal-sales", "orders", "store-orders"] },
  { title: "Compras", sections: ["purchases", "expenses", "requisitions", "payments"] },
  { title: "Analisis", sections: ["planning", "menu-engineering", "audit", "kardex"] },
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
  costeador: "M9 3h6v4H9zM7 7h10l1 14H6zM10 12h4M12 10v4",
  production: "M3 20h18M5 20V9l5 3V9l5 3V6l4 2v12",
  portioning: "M6 4v16M10 4v7a3 3 0 006 0V4M13 14v6",
  inventory: "M3 8h18v12H3zM3 8l2-4h14l2 4M12 8v12",
  waste: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  sales: "M4 18l5-6 4 3 6-8M14 7h6v6",
  "internal-sales": "M7 7h10M7 7l3-3M7 7l3 3M17 17H7m10 0l-3-3m3 3l-3 3M4 12h16",
  orders: "M6 4h12v16l-6-3-6 3zM9 9h6",
  "store-orders": "M4 9h16l-1 11H5zM8 9V6a4 4 0 018 0v3",
  purchases: "M3 5h3l2 11h11M8 20a1 1 0 100-2 1 1 0 000 2M18 20a1 1 0 100-2 1 1 0 000 2M9 9h11l-1 5H9",
  expenses: "M4 6h16v12H4zM4 10h16M8 15h4",
  requisitions: "M4 8h12l-3-3M20 16H8l3 3",
  payments: "M3 7h18v10H3zM3 11h18M7 15h3",
  planning: "M4 19V5m0 14h16M8 15l4-5 3 3 5-7",
  "menu-engineering": "M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5z",
  audit: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 21l-4-4",
  kardex: "M4 5h16v14H4zM4 10h16M9 5v14M13 14h4M13 17h4",
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
      className="h-[19px] w-[19px] shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Menu lateral.
 *
 * Por defecto es una tira angosta de puros iconos (4.5rem). Se abre a 15rem al pasar el
 * mouse o al mover el foco con el teclado, y encima del contenido -no lo empuja-, para que
 * el texto de la pantalla no brinque cada vez que uno roza la orilla. El boton de la flecha
 * la deja fija abierta; esa decision se guarda en la galleta `navPinned`.
 *
 * El hueco del icono mide siempre lo mismo (w-12 dentro de un px-3), asi que el dibujo cae
 * en el mismo punto este abierta o cerrada: al abrirse solo aparece el texto, nada se mueve.
 */
export default function Sidebar({
  items,
  pinned,
  onPinnedChange,
}: {
  items: NavItem[];
  pinned: boolean;
  onPinnedChange: (valor: boolean) => void;
}) {
  const pathname = usePathname();
  const currentSection = pathname.split("/")[1] ?? "";
  const [asomada, setAsomada] = useState(false);

  const abierta = pinned || asomada;

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
      <aside
        onMouseEnter={() => setAsomada(true)}
        onMouseLeave={() => setAsomada(false)}
        onFocusCapture={() => setAsomada(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAsomada(false);
        }}
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-neutral-800 bg-neutral-900 transition-[width] duration-200 ease-out lg:flex ${
          abierta ? "w-60" : "w-[4.5rem]"
        } ${asomada && !pinned ? "shadow-2xl shadow-black/40" : ""}`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-neutral-800 px-3">
          <Link href="/dashboard" className="flex min-w-0 items-center" title="Fondo">
            <span className="flex w-12 shrink-0 items-center justify-center">
              <FondoBadge size={30} tone="dark" />
            </span>
            <span
              className={`whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.22em] text-neutral-100 transition-opacity duration-150 ${
                abierta ? "opacity-100" : "opacity-0"
              }`}
            >
              Fondo
            </span>
          </Link>

          <button
            type="button"
            onClick={() => onPinnedChange(!pinned)}
            aria-label={pinned ? "Soltar el menu" : "Dejar el menu abierto"}
            title={pinned ? "Soltar el menu" : "Dejar el menu abierto"}
            className={`ml-auto mr-1 rounded-md p-1.5 text-neutral-500 transition-opacity duration-150 hover:bg-neutral-800 hover:text-neutral-200 ${
              abierta ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-4 w-4"
            >
              {pinned ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-4 last:mb-0">
              {abierta ? (
                <p className="h-[22px] px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  {group.title}
                </p>
              ) : (
                <div className="mx-4 mb-2 mt-[10px] h-px bg-neutral-800" aria-hidden />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = currentSection === sectionOf(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.label}
                        aria-current={isActive ? "page" : undefined}
                        className={
                          isActive
                            ? "relative flex items-center rounded-md bg-neutral-800 py-2 text-sm font-medium text-white"
                            : "relative flex items-center rounded-md py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
                        }
                      >
                        {isActive && (
                          <span className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r bg-brand-400" />
                        )}
                        <span
                          className={`flex w-12 shrink-0 items-center justify-center ${
                            isActive ? "text-brand-300" : "text-neutral-500"
                          }`}
                        >
                          <NavIcon section={sectionOf(item.href)} />
                        </span>
                        <span
                          className={`truncate pr-3 transition-opacity duration-150 ${
                            abierta ? "opacity-100" : "opacity-0"
                          }`}
                        >
                          {item.label}
                        </span>
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
