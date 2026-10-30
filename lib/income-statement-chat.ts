import { formatMoney } from "@/lib/format";
import {
  buildIncomeStatementFooterRows,
  INCOME_STATEMENT_ROW_DESCRIPTIONS,
  type IncomeStatementResult,
  type IncomeStatementRowView,
} from "@/lib/income-statement";

function pctText(n: number | null): string {
  return n !== null ? `${n.toFixed(2)}%` : "-";
}

function rowLine(row: IncomeStatementRowView, nombres: Map<string, string>): string {
  const cell = (amount: number, pct: number | null) =>
    row.pctMode === "none" ? formatMoney(amount) : `${formatMoney(amount)} (${pctText(pct)})`;
  const partes = row.cells.map(
    (c) => `${nombres.get(c.key) ?? c.key} ${cell(c.amount, c.pct)}`,
  );
  return `- ${row.label}: ${partes.join(" | ")}`;
}

/**
 * Serializa el Estado de Resultados ya calculado a texto plano para dárselo como contexto fijo
 * al modelo. Nunca se le pide al modelo recalcular nada — solo interpretar estas cifras.
 */
export function buildIncomeStatementContext(
  result: IncomeStatementResult,
  rows: IncomeStatementRowView[],
): string {
  const nombres = new Map<string, string>([
    ...result.groups.map((g) => [g.id, g.name] as [string, string]),
    ["consolidado", "Consolidado"],
  ]);

  const lines: string[] = [];
  lines.push(`Sucursal: ${result.sucursalName} (${result.organizationName})`);
  lines.push(`Grupos de costo: ${result.groups.map((g) => g.name).join(", ") || "sin grupos configurados"}`);
  lines.push(`Periodo: ${result.initialDateLabel} al ${result.finalDateLabel} (${result.diasActivos} dias con venta registrada)`);
  lines.push("");
  lines.push("Cada renglon muestra el monto y, cuando aplica, un porcentaje entre parentesis:");
  lines.push("- Para Ventas netas PV, Salidas a otra sucursal y Venta total, el % es la participacion de esa columna dentro del Consolidado.");
  lines.push("- Para Costo de ventas, Costo potencial y Variacion, el % es respecto a la Venta total de esa misma columna.");
  lines.push("");
  for (const row of rows) {
    lines.push(rowLine(row, nombres));
    const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[row.label];
    if (description) lines.push(`  (${description})`);
  }
  lines.push("");
  lines.push("Lo que no se reparte por grupo de costo (va completo en el consolidado):");
  for (const footer of buildIncomeStatementFooterRows(result)) {
    const pct = footer.pct !== null ? ` (${footer.pct.toFixed(2)}% de la venta total)` : "";
    lines.push(`- ${footer.label}: ${formatMoney(footer.amount)}${pct}`);
    const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[footer.label];
    if (description) lines.push(`  (${description})`);
  }
  return lines.join("\n");
}

export const INCOME_STATEMENT_CHAT_SYSTEM_PROMPT = (context: string) => `Eres un asistente financiero que ayuda a la dueña de un restaurante a interpretar su Estado de Resultados. Responde en español, de forma clara y directa, sin tecnicismos innecesarios.

Aqui esta el Estado de Resultados ya calculado para el periodo seleccionado. Estas cifras son datos reales del sistema, ya calculados y correctos — nunca los recalcules ni los cuestiones, solo interpretalos:

${context}

Responde unicamente preguntas relacionadas con estas cifras (que significan, por que pudieron moverse, que tan sano se ve el negocio, en que fijarse). Si preguntan algo fuera de este reporte (por ejemplo, pedir que agregues una funcion al sistema, o temas no financieros), aclara amablemente que solo puedes ayudar a interpretar este Estado de Resultados.`;
