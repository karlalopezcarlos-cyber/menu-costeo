import { formatMoney } from "@/lib/format";
import {
  CLASSIFICATION_LABELS,
  type MenuEngineeringRow,
  type MenuEngineeringClassification,
  type IvaMode,
} from "@/lib/menu-engineering";

export type MenuEngineeringChatMeta = {
  sucursalName: string;
  organizationName: string;
  fromLabel: string;
  toLabel: string;
  ivaMode: IvaMode;
};

function rowLine(row: MenuEngineeringRow): string {
  const popularityPct = `${row.popularity.times(100).toFixed(1)}%`;
  const costPctText = row.costPct !== null ? `${row.costPct.toFixed(1)}%` : "N/D";
  const flag = row.costUnreliable ? " (costo no confiable, posiblemente falten compras capturadas)" : "";
  return `- ${row.recipeName}: ${row.quantitySold.toString()} vendidos (${popularityPct} de popularidad), precio ${formatMoney(row.unitPrice.toNumber())}, costo ${formatMoney(row.cost.toNumber())} (${costPctText} del precio), margen ${formatMoney(row.margin.toNumber())} -- ${CLASSIFICATION_LABELS[row.classification]}${flag}`;
}

/**
 * Serializa el analisis de Ingenieria de Menu ya calculado (exactamente lo que esta filtrado en
 * pantalla: mismo periodo, mismo modo IVA) a texto plano para darselo como contexto fijo al
 * modelo. Nunca se le pide al modelo recalcular nada -- solo interpretar estas cifras.
 */
export function buildMenuEngineeringContext(rows: MenuEngineeringRow[], meta: MenuEngineeringChatMeta): string {
  const lines: string[] = [];
  lines.push(`Sucursal: ${meta.sucursalName} (${meta.organizationName})`);
  lines.push(`Periodo: ${meta.fromLabel} al ${meta.toLabel}`);
  lines.push(
    meta.ivaMode === "sin"
      ? "Precios analizados SIN IVA (ya se le quito el 16% incluido)."
      : "Precios analizados CON IVA incluido.",
  );
  lines.push("");
  lines.push(
    "Clasificacion de ingenieria de menu (Kasavana & Smith): Estrella = alta popularidad + alta rentabilidad (promuevelos); Caballo de batalla = alta popularidad + baja rentabilidad (revisa costo o precio); Acertijo = baja popularidad + alta rentabilidad (promocionalos o redisenalos); Perro = baja popularidad + baja rentabilidad (candidatos a quitar del menu).",
  );
  lines.push("");
  lines.push("Platillos en este periodo, de mas a menos vendidos:");
  const sorted = [...rows].sort((a, b) => b.quantitySold.minus(a.quantitySold).toNumber());
  for (const row of sorted) lines.push(rowLine(row));

  lines.push("");
  const counts: Record<MenuEngineeringClassification, number> = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };
  for (const row of rows) counts[row.classification] += 1;
  lines.push(
    `Resumen: ${counts.STAR} Estrella, ${counts.PLOWHORSE} Caballo de batalla, ${counts.PUZZLE} Acertijo, ${counts.DOG} Perro (de ${rows.length} platillos en total).`,
  );
  return lines.join("\n");
}

export const MENU_ENGINEERING_CHAT_SYSTEM_PROMPT = (context: string) => `Eres un asistente que ayuda a la dueña de un restaurante a interpretar su analisis de Ingenieria de Menu. Responde en español, de forma clara y directa, sin tecnicismos innecesarios.

Aqui esta el analisis ya calculado para el periodo y filtro seleccionados -- estos son exactamente los platillos que estan filtrados en pantalla ahorita mismo. Estas cifras son datos reales del sistema, ya calculadas y correctas -- nunca las recalcules ni las cuestiones, solo interpretalas:

${context}

Responde unicamente preguntas relacionadas con este analisis (que platillos promover, cuales revisar o quitar, que significa cada clasificacion, tendencias que veas). Si preguntan algo fuera de este reporte (por ejemplo, pedir que agregues una funcion al sistema, o temas no relacionados), aclara amablemente que solo puedes ayudar a interpretar este analisis de Ingenieria de Menu.`;
