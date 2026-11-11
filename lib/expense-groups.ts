import type { ExpenseGroup } from "@/generated/prisma/client";

/**
 * Los cuatro renglones de gasto del Estado de Resultados, y la etiqueta de lo que todavia no
 * tiene grupo.
 *
 * Vive aparte de lib/income-statement.ts porque la pantalla de Configuracion es un componente
 * de cliente y ese modulo arrastra @/lib/prisma al bundle del navegador. Aqui solo hay texto.
 */
export const SIN_GRUPO_GASTO = "SIN_GRUPO";
export type ExpenseGroupKey = ExpenseGroup | typeof SIN_GRUPO_GASTO;

export const EXPENSE_GROUP_LABELS: Record<ExpenseGroupKey, string> = {
  ADMINISTRACION: "Gastos de administracion",
  OPERACION: "Gastos de operacion",
  PERSONAL: "Gastos de personal",
  FINANCIEROS: "Gastos financieros",
  [SIN_GRUPO_GASTO]: "Sin grupo asignado",
};

/** El orden en que se listan en el reporte. Lo sin clasificar va al final. */
export const EXPENSE_GROUP_ORDER: ExpenseGroupKey[] = [
  "ADMINISTRACION",
  "OPERACION",
  "PERSONAL",
  "FINANCIEROS",
  SIN_GRUPO_GASTO,
];

/** Valida lo que llega de un <select>: "" significa dejarlo sin asignar. */
export function parseExpenseGroup(value: string): ExpenseGroup | null {
  if (value === "") return null;
  const valido = EXPENSE_GROUP_ORDER.includes(value as ExpenseGroupKey) && value !== SIN_GRUPO_GASTO;
  if (!valido) throw new Error(`Grupo de gasto desconocido: ${value}`);
  return value as ExpenseGroup;
}
