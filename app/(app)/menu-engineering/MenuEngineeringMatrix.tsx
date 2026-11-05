"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  CLASSIFICATION_ADVICE,
  CLASSIFICATION_ICONS,
  CLASSIFICATION_LABELS,
  DOT_COLORS,
  type MenuEngineeringClassification,
  type MenuEngineeringRowView,
} from "@/lib/menu-engineering-view";

/**
 * El lienzo en unidades del viewBox. El SVG escala al ancho disponible, asi que todo lo que se
 * calcula aqui (posiciones, anchos de etiqueta) vive en estas unidades y no en pixeles.
 */
const VIEW_W = 1000;
const VIEW_H = 620;
const PAD = { top: 28, right: 28, bottom: 56, left: 68 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const DOT_R = 5.5;
const LABEL_SIZE = 11;
/** Ancho aproximado de un caracter a LABEL_SIZE. Sirve para no encimar etiquetas. */
const CHAR_W = 5.6;
const LABEL_GAP = 9;

type Placed = { row: MenuEngineeringRowView; x: number; y: number; labelX: number; anchor: "start" | "end" };
type Box = { x1: number; y1: number; x2: number; y2: number };

function overlaps(a: Box, b: Box): boolean {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

export default function MenuEngineeringMatrix({
  rows,
  averageMargin,
  popularityThreshold,
  ivaMode,
}: {
  rows: MenuEngineeringRowView[];
  /** Umbral de margen con el que se clasifico. La raya vertical. */
  averageMargin: number;
  /** Umbral de popularidad con el que se clasifico. La raya horizontal. */
  popularityThreshold: number;
  ivaMode: "con" | "sin";
}) {
  const [hovered, setHovered] = useState<Placed | null>(null);

  // Un platillo sin costo confiable no tiene coordenada honesta: su margen es el precio casi
  // completo y aterrizaria hasta la derecha, justo donde dice "este deja mucho dinero".
  const plotted = useMemo(() => rows.filter((r) => r.classification !== null), [rows]);
  const sinCostear = rows.length - plotted.length;

  const scales = useMemo(() => {
    if (plotted.length === 0) return null;

    const margins = plotted.map((r) => r.margin);
    const pops = plotted.map((r) => r.popularity);
    // Los umbrales entran al dominio: si todos los platillos cayeran de un solo lado, la raya
    // quedaria fuera del lienzo y la matriz se veria sin divisiones.
    const minX = Math.min(...margins, averageMargin, 0);
    const maxX = Math.max(...margins, averageMargin);
    const maxY = Math.max(...pops, popularityThreshold);

    const padX = (maxX - minX) * 0.08 || 1;
    const padY = maxY * 0.1 || 0.01;
    const x0 = minX - padX;
    const x1 = maxX + padX;
    const y1 = maxY + padY;

    return {
      x: (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * PLOT_W,
      y: (v: number) => PAD.top + PLOT_H - (v / y1) * PLOT_H,
      domain: { x0, x1, y1 },
    };
  }, [plotted, averageMargin, popularityThreshold]);

  /**
   * Las etiquetas se colocan por orden de importancia (lo mas vendido primero) y solo si no se
   * encima con una ya puesta. Con 136 platillos, escribir todos los nombres deja una mancha
   * ilegible; asi se leen los que importan y el resto da su nombre al pasar el cursor.
   */
  const { points, labelled } = useMemo(() => {
    if (!scales) return { points: [] as Placed[], labelled: [] as Placed[] };

    const points: Placed[] = plotted.map((row) => {
      const x = scales.x(row.margin);
      const y = scales.y(row.popularity);
      const width = row.recipeName.length * CHAR_W;
      const anchor: "start" | "end" = x + LABEL_GAP + width > VIEW_W - PAD.right ? "end" : "start";
      return { row, x, y, labelX: anchor === "start" ? x + LABEL_GAP : x - LABEL_GAP, anchor };
    });

    const taken: Box[] = [];
    const labelled: Placed[] = [];
    for (const p of [...points].sort((a, b) => b.row.quantitySold - a.row.quantitySold)) {
      const width = p.row.recipeName.length * CHAR_W;
      const box: Box =
        p.anchor === "start"
          ? { x1: p.labelX, y1: p.y - LABEL_SIZE / 2, x2: p.labelX + width, y2: p.y + LABEL_SIZE / 2 }
          : { x1: p.labelX - width, y1: p.y - LABEL_SIZE / 2, x2: p.labelX, y2: p.y + LABEL_SIZE / 2 };
      if (taken.some((t) => overlaps(box, t))) continue;
      taken.push(box);
      labelled.push(p);
    }
    return { points, labelled };
  }, [plotted, scales]);

  if (!scales || plotted.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500 shadow-sm">
        No hay platillos clasificados que graficar con este filtro.
        {sinCostear > 0 && ` ${sinCostear} quedaron fuera porque su receta no se puede costear.`}
      </div>
    );
  }

  // Arriba del punto por defecto; abajo cuando el punto esta tan alto que no cabria.
  const tooltipBelow = !!hovered && hovered.y < VIEW_H * 0.42;

  const xMid = scales.x(averageMargin);
  const yMid = scales.y(popularityThreshold);

  // Cada cuadrante se rotula en su esquina, mirando hacia adentro.
  const quadrants: { c: MenuEngineeringClassification; x: number; y: number; anchor: "start" | "end" }[] = [
    { c: "PLOWHORSE", x: PAD.left + 10, y: PAD.top + 18, anchor: "start" },
    { c: "STAR", x: VIEW_W - PAD.right - 10, y: PAD.top + 18, anchor: "end" },
    { c: "DOG", x: PAD.left + 10, y: PAD.top + PLOT_H - 10, anchor: "start" },
    { c: "PUZZLE", x: VIEW_W - PAD.right - 10, y: PAD.top + PLOT_H - 10, anchor: "end" },
  ];

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img">
          {/* Fondo tenue de cada cuadrante, para que se lean sin tener que seguir las rayas. */}
          <rect x={PAD.left} y={PAD.top} width={xMid - PAD.left} height={yMid - PAD.top} fill="#2563eb" opacity={0.04} />
          <rect x={xMid} y={PAD.top} width={VIEW_W - PAD.right - xMid} height={yMid - PAD.top} fill="#16a34a" opacity={0.05} />
          <rect x={PAD.left} y={yMid} width={xMid - PAD.left} height={PAD.top + PLOT_H - yMid} fill="#dc2626" opacity={0.04} />
          <rect x={xMid} y={yMid} width={VIEW_W - PAD.right - xMid} height={PAD.top + PLOT_H - yMid} fill="#d97706" opacity={0.04} />

          {/* Las dos rayas son los umbrales reales con los que se clasifico. */}
          <line x1={xMid} y1={PAD.top} x2={xMid} y2={PAD.top + PLOT_H} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
          <line x1={PAD.left} y1={yMid} x2={VIEW_W - PAD.right} y2={yMid} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />

          {/* Ejes */}
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + PLOT_H} stroke="#334155" strokeWidth={1.5} />
          <line x1={PAD.left} y1={PAD.top + PLOT_H} x2={VIEW_W - PAD.right} y2={PAD.top + PLOT_H} stroke="#334155" strokeWidth={1.5} />

          {quadrants.map((q) => (
            <text
              key={q.c}
              x={q.x}
              y={q.y}
              textAnchor={q.anchor}
              fontSize={13}
              fontWeight={600}
              fill={DOT_COLORS[q.c]}
              opacity={0.75}
            >
              {CLASSIFICATION_ICONS[q.c]} {CLASSIFICATION_LABELS[q.c]}
            </text>
          ))}

          {/* Valor de cada umbral, pegado a su raya. */}
          <text x={xMid + 5} y={PAD.top + PLOT_H + 16} fontSize={10} fill="#64748b">
            promedio {formatMoney(averageMargin)}
          </text>
          <text x={PAD.left - 6} y={yMid + 3} textAnchor="end" fontSize={10} fill="#64748b">
            {(popularityThreshold * 100).toFixed(2)}%
          </text>

          <text x={PAD.left + PLOT_W / 2} y={VIEW_H - 14} textAnchor="middle" fontSize={12} fill="#475569">
            Margen de contribucion por pieza{ivaMode === "con" ? " (precio con IVA)" : " (precio sin IVA)"}
          </text>
          <text
            x={16}
            y={PAD.top + PLOT_H / 2}
            textAnchor="middle"
            fontSize={12}
            fill="#475569"
            transform={`rotate(-90 16 ${PAD.top + PLOT_H / 2})`}
          >
            Popularidad (% de las piezas vendidas)
          </text>

          {points.map((p) => (
            <circle
              key={p.row.recipeId}
              cx={p.x}
              cy={p.y}
              r={hovered?.row.recipeId === p.row.recipeId ? DOT_R + 3 : DOT_R}
              fill={DOT_COLORS[p.row.classification!]}
              stroke="#ffffff"
              strokeWidth={1.5}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(p)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}

          {labelled.map((p) => (
            <text
              key={`l-${p.row.recipeId}`}
              x={p.labelX}
              y={p.y + LABEL_SIZE / 3}
              textAnchor={p.anchor}
              fontSize={LABEL_SIZE}
              fill="#334155"
              className="pointer-events-none"
            >
              {p.row.recipeName}
            </text>
          ))}
        </svg>

        {hovered && (
          <div
            className={`pointer-events-none absolute z-10 w-60 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-lg ${
              tooltipBelow ? "" : "-translate-y-full"
            }`}
            style={{
              // Centrada en el punto, pero sin salirse: a la orilla se quedaria cortada.
              left: `${Math.min(84, Math.max(16, (hovered.x / VIEW_W) * 100))}%`,
              top: `${((hovered.y + (tooltipBelow ? DOT_R + 8 : -DOT_R - 6)) / VIEW_H) * 100}%`,
            }}
          >
            <p className="font-semibold text-neutral-900">{hovered.row.recipeName}</p>
            {hovered.row.categoryName && <p className="text-neutral-400">{hovered.row.categoryName}</p>}
            <dl className="mt-2 space-y-0.5 text-neutral-600">
              <div className="flex justify-between gap-3">
                <dt>Vendidos</dt>
                <dd className="font-medium text-neutral-900">{hovered.row.quantitySold}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Precio</dt>
                <dd className="font-medium text-neutral-900">{formatMoney(hovered.row.unitPrice)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Costo</dt>
                <dd className="font-medium text-neutral-900">
                  {formatMoney(hovered.row.cost)}
                  {hovered.row.costPct !== null && ` (${hovered.row.costPct.toFixed(1)}%)`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Margen c/u</dt>
                <dd className="font-medium text-neutral-900">{formatMoney(hovered.row.margin)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Margen del periodo</dt>
                <dd className="font-medium text-neutral-900">{formatMoney(hovered.row.totalMargin)}</dd>
              </div>
            </dl>
            <p className="mt-2 border-t border-neutral-100 pt-2 font-medium" style={{ color: DOT_COLORS[hovered.row.classification!] }}>
              {CLASSIFICATION_ICONS[hovered.row.classification!]} {CLASSIFICATION_LABELS[hovered.row.classification!]}
            </p>
            <p className="text-neutral-500">{CLASSIFICATION_ADVICE[hovered.row.classification!]}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        Las rayas son los umbrales con los que se clasifico: el margen promedio ponderado del menu
        y el 70% de la popularidad esperada. No se mueven al filtrar, para que un platillo no
        cambie de cuadrante segun lo que tengas en pantalla.
        {sinCostear > 0 &&
          ` ${sinCostear} ${sinCostear === 1 ? "platillo no aparece" : "platillos no aparecen"} en la matriz: sin costo confiable no hay donde ponerlos.`}
      </p>
    </div>
  );
}
