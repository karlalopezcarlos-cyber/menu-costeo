import type { Panel } from "@/generated/prisma/client";

export const PANEL_DEFS: { key: Panel; section: string; href: string; label: string }[] = [
  { key: "DASHBOARD", section: "dashboard", href: "/dashboard", label: "Panel" },
  { key: "PRODUCTS", section: "products", href: "/products", label: "Productos" },
  { key: "WASTE", section: "waste", href: "/waste", label: "Mermas" },
  { key: "RECIPES", section: "recipes", href: "/recipes", label: "Recetas" },
  { key: "PRODUCTION", section: "production", href: "/production", label: "Produccion" },
  { key: "INVENTORY", section: "inventory", href: "/inventory", label: "Inventario" },
  { key: "AUDIT", section: "audit", href: "/audit", label: "Auditoria" },
  { key: "ORDERS", section: "orders", href: "/orders", label: "Pedidos" },
  { key: "PURCHASES", section: "purchases", href: "/purchases", label: "Compras" },
  { key: "REQUISITIONS", section: "requisitions", href: "/requisitions", label: "Requisiciones" },
  { key: "PAYMENTS", section: "payments", href: "/payments", label: "Pagos" },
  { key: "SALES", section: "sales", href: "/sales", label: "Ventas" },
  { key: "MENU_ENGINEERING", section: "menu-engineering", href: "/menu-engineering", label: "Ingenieria de menu" },
  { key: "SETTINGS", section: "settings", href: "/settings/categories", label: "Configuracion" },
];

const SECTION_TO_PANEL = new Map(PANEL_DEFS.map((p) => [p.section, p.key]));

/** El panel al que pertenece una ruta, a partir de su primer segmento (ej. "/purchases/new" -> PURCHASES). */
export function panelForPath(pathname: string): Panel | null {
  const section = pathname.split("/")[1] ?? "";
  return SECTION_TO_PANEL.get(section) ?? null;
}

/** El Panel de Inicio/Dashboard siempre es visible; el resto depende de allowedPanels para STAFF. */
export function hasPanelAccess(role: string, allowedPanels: Panel[], panel: Panel): boolean {
  if (role !== "STAFF") return true;
  if (panel === "DASHBOARD") return true;
  return allowedPanels.includes(panel);
}
