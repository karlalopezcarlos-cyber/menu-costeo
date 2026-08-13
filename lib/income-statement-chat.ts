import { formatMoney } from "@/lib/format";
import {
  INCOME_STATEMENT_ROW_DESCRIPTIONS,
  type IncomeStatementResult,
  type IncomeStatementRowView,
} from "@/lib/income-statement";

function pctText(n: number | null): string {
  return n !== null ? `${n.toFixed(2)}%` : "-";
}

function rowLine(row: IncomeStatementRowView): string {
  const cell = (amount: number, pct: number | null) =>
    row.pctMode === "none" ? formatMoney(amount) : `${formatMoney(amount)} (${pctText(pct)})`;
  return `- ${row.label}: Alimento ${cell(row.alimento, row.alimentoPct)} | Bebidas ${cell(row.bebidas, row.bebidasPct)} | Miscelaneos ${cell(row.miscelaneos, row.miscelaneosPct)} | Consolidado ${cell(row.consolidado, row.consolidadoPct)}`;
}

/**
 * Serializa el Estado de Resultados ya calculado a texto plano para dárselo como contexto fijo
 * al modelo. Nunca se le pide al modelo recalcular nada — solo interpretar estas cifras.
 */
export function buildIncomeStatementContext(
  result: IncomeStatementResult,
  rows: IncomeStatementRowView[],
): string {
  const lines: string[] = [];
  lines.push(`Sucursal: ${result.sucursalName} (${result.organizationName})`);
  lines.push(`Periodo: ${result.initialDateLabel} al ${result.finalDateLabel} (${result.diasActivos} dias con venta registrada)`);
  lines.push("");
  lines.push("Cada renglon muestra el monto y, cuando aplica, un porcentaje entre parentesis:");
  lines.push("- Para Ventas netas PV, Salidas a otra sucursal y Venta total, el % es la participacion de esa columna dentro del Consolidado.");
  lines.push("- Para Costo de ventas, Costo potencial y Variacion, el % es respecto a la Venta total de esa misma columna.");
  lines.push("");
  for (const row of rows) {
    lines.push(rowLine(row));
    const description = INCOME_STATEMENT_ROW_DESCRIPTIONS[row.label];
    if (description) lines.push(`  (${description})`);
  }
  lines.push("");
  lines.push(`- Monto pagado a proveedores en el periodo: ${formatMoney(result.montoPagado)} (${INCOME_STATEMENT_ROW_DESCRIPTIONS["Monto pagado"]})`);
  lines.push(`- Venta promedio diaria (consolidado): ${formatMoney(result.ventaPromedioDiaria.consolidado)}`);
  return lines.join("\n");
}

export const INCOME_STATEMENT_CHAT_SYSTEM_PROMPT = (context: string) => `Eres un asistente financiero que ayuda a la dueña de un restaurante a interpretar su Estado de Resultados. Responde en español, de forma clara y directa, sin tecnicismos innecesarios.

Aqui esta el Estado de Resultados ya calculado para el periodo seleccionado. Estas cifras son datos reales del sistema, ya calculados y correctos — nunca los recalcules ni los cuestiones, solo interpretalos:

${context}

Responde unicamente preguntas relacionadas con estas cifras (que significan, por que pudieron moverse, que tan sano se ve el negocio, en que fijarse). Si preguntan algo fuera de este reporte (por ejemplo, pedir que agregues una funcion al sistema, o temas no financieros), aclara amablemente que solo puedes ayudar a interpretar este Estado de Resultados.`;
