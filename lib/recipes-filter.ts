export type RecipeTypeFilter = "all" | "plu" | "subrecipe";

export function parseRecipeTypeFilter(value: string | null | undefined): RecipeTypeFilter {
  return value === "plu" || value === "subrecipe" ? value : "all";
}

/** `undefined` = sin filtro (todas); si no, el valor exacto que va en el `where.isMenuItem` de Prisma. */
export function recipeTypeFilterToIsMenuItem(filter: RecipeTypeFilter): boolean | undefined {
  if (filter === "plu") return true;
  if (filter === "subrecipe") return false;
  return undefined;
}
