/**
 * Lo que la tabla y la matriz necesitan saber en el cliente.
 *
 * Vive aparte de lib/menu-engineering.ts a proposito: ese modulo importa @/lib/prisma en su
 * cadena, y cualquier componente "use client" que lo toque arrastra el cliente de base de datos
 * al bundle del navegador. Aqui no hay nada que no pueda viajar al cliente.
 */

export type MenuEngineeringClassification = "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG";
export type IvaMode = "con" | "sin";

export const CLASSIFICATION_LABELS: Record<MenuEngineeringClassification, string> = {
  STAR: "Estrella",
  PLOWHORSE: "Caballo de batalla",
  PUZZLE: "Acertijo",
  DOG: "Perro",
};

export const BADGE_CLASSES: Record<MenuEngineeringClassification, string> = {
  STAR: "bg-green-100 text-green-800",
  PLOWHORSE: "bg-blue-100 text-blue-800",
  PUZZLE: "bg-amber-100 text-amber-800",
  DOG: "bg-red-100 text-red-800",
};

/** El color del punto en la matriz. Mismo codigo de color que la etiqueta de la tabla. */
export const DOT_COLORS: Record<MenuEngineeringClassification, string> = {
  STAR: "#16a34a",
  PLOWHORSE: "#2563eb",
  PUZZLE: "#d97706",
  DOG: "#dc2626",
};

export const CLASSIFICATION_ICONS: Record<MenuEngineeringClassification, string> = {
  STAR: "⭐",
  PLOWHORSE: "🐴",
  PUZZLE: "🧩",
  DOG: "🐶",
};

/** De mejor a peor, que es como se lee el reporte y como conviene ofrecerlas en un filtro. */
export const CLASSIFICATION_ORDER: MenuEngineeringClassification[] = [
  "STAR",
  "PLOWHORSE",
  "PUZZLE",
  "DOG",
];

/** Que hacer con cada cuadrante, en una linea. Se usa de rotulo en la matriz. */
export const CLASSIFICATION_ADVICE: Record<MenuEngineeringClassification, string> = {
  STAR: "Protegelos: calidad y porcion intactas",
  PLOWHORSE: "Bajales el costo o subeles el precio",
  PUZZLE: "Promuevelos o cambialos de lugar en la carta",
  DOG: "Candidatos a salir de la carta",
};

/** Valor del filtro para los platillos que no se pudieron costear. */
export const SIN_CLASIFICAR = "none";
/** Valor del filtro de categoria para las recetas que no tienen una asignada. */
export const SIN_CATEGORIA = "__sin_categoria__";

/**
 * Version con numeros planos de MenuEngineeringRow (Decimal.js no es serializable de Server a
 * Client Component), armada en page.tsx antes de pasarla a la vista.
 */
export type MenuEngineeringRowView = {
  recipeId: string;
  recipeName: string;
  categoryName: string | null;
  quantitySold: number;
  unitPrice: number;
  cost: number;
  totalCost: number;
  margin: number;
  totalMargin: number;
  costPct: number | null;
  popularity: number;
  classification: MenuEngineeringClassification | null;
  costUnreliable: boolean;
  costIssues: string[];
};

export type MenuEngineeringFilters = {
  search: string;
  classification: "all" | MenuEngineeringClassification | typeof SIN_CLASIFICAR;
  category: string;
};

/** Un solo lugar para filtrar, para que la tabla y la matriz nunca muestren conjuntos distintos. */
export function filterMenuRows(
  rows: MenuEngineeringRowView[],
  filters: MenuEngineeringFilters,
): MenuEngineeringRowView[] {
  const term = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (term && !row.recipeName.toLowerCase().includes(term)) return false;

    if (filters.classification === SIN_CLASIFICAR) {
      if (row.classification !== null) return false;
    } else if (filters.classification !== "all" && row.classification !== filters.classification) {
      return false;
    }

    if (filters.category === SIN_CATEGORIA) {
      if (row.categoryName !== null) return false;
    } else if (filters.category !== "all" && row.categoryName !== filters.category) {
      return false;
    }

    return true;
  });
}

export function hasAnyMenuFilter(filters: MenuEngineeringFilters): boolean {
  return !!filters.search.trim() || filters.classification !== "all" || filters.category !== "all";
}
