"use client";

import { useState } from "react";
import Decimal from "decimal.js";
import { convertQty, UNIT_LABELS, type UnitValue } from "@/lib/units";

export type PresentationOption = { id: string; label: string; quantity: string; unit: UnitValue };

const MANUAL = "manual";
const MAX_LINES = 3;

type Line = { presentationId: string; count: string };

function lineBaseQty(
  line: Line,
  baseUnit: UnitValue,
  presentations: PresentationOption[],
): Decimal | null {
  const n = Number(line.count);
  if (!line.count || !Number.isFinite(n) || n <= 0) return null;
  if (line.presentationId === MANUAL) return new Decimal(n);
  const presentation = presentations.find((p) => p.id === line.presentationId);
  if (!presentation) return null;
  try {
    return convertQty(new Decimal(n).times(presentation.quantity), presentation.unit, baseUnit);
  } catch {
    return null;
  }
}

function lineLabel(line: Line, unitLabel: string, presentations: PresentationOption[]): string | null {
  const n = Number(line.count);
  if (!line.count || !Number.isFinite(n) || n <= 0) return null;
  if (line.presentationId === MANUAL) return `${n} ${unitLabel}`;
  const presentation = presentations.find((p) => p.id === line.presentationId);
  return presentation ? `${n} ${presentation.label}` : null;
}

/**
 * Input de cantidad que, si el producto tiene presentaciones definidas (ej. "Lata 2.75kg" = 2.75
 * KG), deja elegir la presentacion + cuantas piezas, y calcula sola la cantidad equivalente en la
 * unidad base del producto. Si el producto no tiene presentaciones, es un input numerico normal.
 */
export default function PresentationQuantityInput({
  baseUnit,
  unitLabel,
  presentations,
  value,
  onChange,
  onPresentationChange,
  disabled,
  multiPresentation,
}: {
  baseUnit: UnitValue;
  unitLabel: string;
  presentations: PresentationOption[];
  value: string;
  onChange: (quantity: string) => void;
  /** Se dispara cuando el usuario elige una presentacion (o vuelve a cantidad libre = null), para
   * que el formulario pueda sincronizar el campo de texto "Presentacion" con el nombre exacto. */
  onPresentationChange?: (label: string | null) => void;
  disabled?: boolean;
  /** Permite capturar hasta 3 presentaciones distintas para el mismo renglon (ej. "2 costales +
   * 1 bolsa"), sumando su equivalente en la unidad base. Pensado para Pedidos, donde se pide en
   * piezas completas de cada presentacion (sin sobrante suelto). */
  multiPresentation?: boolean;
}) {
  const [mode, setMode] = useState<string>(MANUAL);
  const [pieceCount, setPieceCount] = useState("");
  const [extraQty, setExtraQty] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [{ presentationId: MANUAL, count: value || "" }]);

  if (presentations.length === 0) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-neutral-400">{unitLabel}</span>
      </div>
    );
  }

  if (multiPresentation) {
    const recomputeLines = (nextLines: Line[]) => {
      let total: Decimal | null = null;
      for (const line of nextLines) {
        const qty = lineBaseQty(line, baseUnit, presentations);
        if (qty) total = total ? total.plus(qty) : qty;
      }
      onChange(total ? total.toString() : "");
      const labels = nextLines
        .map((l) => lineLabel(l, unitLabel, presentations))
        .filter((l): l is string => !!l);
      onPresentationChange?.(labels.length ? labels.join(" + ") : null);
    };

    const updateLine = (index: number, patch: Partial<Line>) => {
      const next = lines.map((l, i) => {
        if (i !== index) return l;
        const merged = { ...l, ...patch };
        // Una presentacion se pide en piezas completas (ej. 1 costal, no 0.1 costal); solo la
        // cantidad libre admite decimales.
        if (merged.presentationId !== MANUAL) {
          merged.count = merged.count.replace(/[^\d]/g, "");
        }
        return merged;
      });
      setLines(next);
      recomputeLines(next);
    };

    const addLine = () => {
      if (lines.length >= MAX_LINES) return;
      setLines((prev) => [...prev, { presentationId: MANUAL, count: "" }]);
    };

    const removeLine = (index: number) => {
      const next = lines.filter((_, i) => i !== index);
      setLines(next);
      recomputeLines(next);
    };

    return (
      <div className="space-y-1">
        {lines.map((line, index) => (
          <div key={index} className="flex items-center gap-1">
            <input
              type="number"
              step={line.presentationId === MANUAL ? "any" : "1"}
              min="0"
              value={line.count}
              onChange={(e) => updateLine(index, { count: e.target.value })}
              disabled={disabled}
              placeholder="0"
              className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            />
            <select
              value={line.presentationId}
              onChange={(e) => updateLine(index, { presentationId: e.target.value })}
              disabled={disabled}
              className="rounded border border-neutral-300 px-1 py-0.5 text-xs text-neutral-600"
            >
              <option value={MANUAL}>Cantidad libre ({unitLabel})</option>
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} = {Number(p.quantity)} {UNIT_LABELS[p.unit]}
                </option>
              ))}
            </select>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => removeLine(index)}
                disabled={disabled}
                className="text-neutral-400 hover:text-red-600"
                title="Quitar presentacion"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {lines.length < MAX_LINES && (
          <button
            type="button"
            onClick={addLine}
            disabled={disabled}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            + Agregar presentacion
          </button>
        )}
        {value && (
          <p className="inline-block rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-sm font-bold text-neutral-900">
            = {Number(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })} {unitLabel}
          </p>
        )}
      </div>
    );
  }

  function recompute(nextMode: string, count: string, extra: string) {
    if (nextMode === MANUAL) return;
    const presentation = presentations.find((p) => p.id === nextMode);
    if (!presentation) return;
    const n = Number(count);
    const extraN = Number(extra);
    const hasCount = count && Number.isFinite(n) && n > 0;
    const hasExtra = extra && Number.isFinite(extraN) && extraN > 0;
    if (!hasCount && !hasExtra) {
      onChange("");
      return;
    }
    try {
      let total = hasCount ? convertQty(new Decimal(n).times(presentation.quantity), presentation.unit, baseUnit) : new Decimal(0);
      if (hasExtra) total = total.plus(extraN);
      onChange(total.toString());
    } catch {
      onChange("");
    }
  }

  function handleModeChange(nextMode: string) {
    setMode(nextMode);
    const presentation = presentations.find((p) => p.id === nextMode);
    onPresentationChange?.(presentation ? presentation.label : null);
    if (nextMode === MANUAL) return;
    recompute(nextMode, pieceCount, extraQty);
  }

  function handlePieceCountChange(count: string) {
    setPieceCount(count);
    recompute(mode, count, extraQty);
  }

  function handleExtraQtyChange(extra: string) {
    setExtraQty(extra);
    recompute(mode, pieceCount, extra);
  }

  const selectedPresentation = presentations.find((p) => p.id === mode);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {mode === MANUAL ? (
          <input
            type="number"
            step="any"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="0"
            className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
        ) : (
          <input
            type="number"
            step="any"
            min="0"
            value={pieceCount}
            onChange={(e) => handlePieceCountChange(e.target.value)}
            disabled={disabled}
            placeholder="0"
            className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
        )}
        <span className="text-xs text-neutral-400">
          {mode === MANUAL ? unitLabel : selectedPresentation?.label}
        </span>
      </div>
      {mode !== MANUAL && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">+</span>
          <input
            type="number"
            step="any"
            min="0"
            value={extraQty}
            onChange={(e) => handleExtraQtyChange(e.target.value)}
            disabled={disabled}
            placeholder="0"
            className="w-14 rounded border border-neutral-300 px-1 py-0.5 text-xs"
          />
          <span className="text-xs text-neutral-400">{unitLabel} suelto</span>
        </div>
      )}
      <select
        value={mode}
        onChange={(e) => handleModeChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-neutral-300 px-1 py-0.5 text-xs text-neutral-600"
      >
        <option value={MANUAL}>Cantidad libre ({unitLabel})</option>
        {presentations.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} = {Number(p.quantity)} {UNIT_LABELS[p.unit]}
          </option>
        ))}
      </select>
      {mode !== MANUAL && value && (
        <p className="inline-block rounded border border-neutral-300 bg-neutral-50 px-2 py-1 text-sm font-bold text-neutral-900">
          = {Number(value).toLocaleString("es-MX", { maximumFractionDigits: 2 })} {unitLabel}
        </p>
      )}
    </div>
  );
}
