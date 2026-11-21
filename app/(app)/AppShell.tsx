"use client";

import { useState } from "react";
import Sidebar, { type NavItem } from "./Sidebar";

/**
 * Armazon de la app: el menu lateral y el area de contenido.
 *
 * Vive aqui y no en layout.tsx porque el ancho del menu y el margen del contenido son el
 * mismo dato: si el menu esta en tira angosta, el contenido empieza en 4.5rem; si esta fijo
 * abierto, en 15rem. El valor inicial llega desde el servidor (galleta `navPinned`) para que
 * la pagina no aparezca con el menu en una medida y brinque a la otra al cargar el JavaScript.
 */
export default function AppShell({
  items,
  pinnedInicial,
  header,
  children,
}: {
  items: NavItem[];
  pinnedInicial: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [pinned, setPinned] = useState(pinnedInicial);

  function cambiarPinned(valor: boolean) {
    setPinned(valor);
    document.cookie = `navPinned=${valor ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar items={items} pinned={pinned} onPinnedChange={cambiarPinned} />
      <div
        className={`transition-[padding] duration-200 ease-out ${
          pinned ? "lg:pl-60" : "lg:pl-[4.5rem]"
        }`}
      >
        {header}
        <main className="mx-auto max-w-[1600px] px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
