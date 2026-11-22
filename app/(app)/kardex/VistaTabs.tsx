import Link from "next/link";

/**
 * Las dos preguntas del kardex: que paso en el periodo, y cuanto deberia haber hoy. Son
 * consultas distintas (una tiene periodo, la otra una sola fecha), asi que no comparten filtros:
 * cambiar de pestaña arranca limpio a proposito.
 */
export default function VistaTabs({ vista }: { vista: "movimientos" | "corte" }) {
  const tabs = [
    { key: "movimientos", label: "Movimientos", href: "/kardex" },
    { key: "corte", label: "Inventario al corte", href: "/kardex?vista=corte" },
  ] as const;

  return (
    <nav className="flex gap-4 border-b border-neutral-200 text-sm">
      {tabs.map((tab) =>
        tab.key === vista ? (
          <span
            key={tab.key}
            className="border-b-2 border-neutral-900 pb-2 font-medium text-neutral-900"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.key}
            href={tab.href}
            className="pb-2 text-neutral-500 transition-colors hover:text-neutral-900"
          >
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
