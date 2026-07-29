"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4">
      {items.map((item) => {
        const currentSection = pathname.split("/")[1] ?? "";
        const itemSection = item.href.split("/")[1] ?? "";
        const isActive = currentSection === itemSection;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "text-sm font-medium text-neutral-900 border-b-2 border-neutral-900 pb-1"
                : "text-sm font-medium text-neutral-600 hover:text-neutral-900 border-b-2 border-transparent pb-1"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
