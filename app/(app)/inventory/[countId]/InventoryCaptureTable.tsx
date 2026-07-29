"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { autoSaveInventoryCount, saveInventoryCount, type InventoryCaptureEntry } from "./actions";
import PresentationQuantityInput, {
  type PresentationOption,
} from "../../_components/PresentationQuantityInput";
import type { UnitValue } from "@/lib/units";

export type CostBasis = "net" | "gross";

export type CaptureRow = {
  key: string;
  type: "Producto" | "Subreceta";
  id: string;
  name: string;
  categoryName: string | null;
  baseUnit: UnitValue;
  unitLabel: string;
  yieldPercentage: number;
  netUnitCost: number;
  grossUnitCost: number;
  initialCostBasis: CostBasis;
  initialQuantity: number;
  presentations: PresentationOption[];
};

type SortKey = "category" | "type" | "name" | "unitCost" | "quantity" | "total";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "category", label: "Categoria" },
  { key: "name", label: "Nombre" },
  { key: "type", label: "Tipo" },
  { key: "unitCost", label: "Costo unitario" },
  { key: "quantity", label: "Cantidad" },
  { key: "total", label: "Total" },
];

export default function InventoryCaptureTable({
  countId,
  rows,
}: {
  countId: string;
  rows: CaptureRow[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, r.initialQuantity ? String(r.initialQuantity) : ""])),
  );
  const [costBasis, setCostBasis] = useState<Record<string, CostBasis>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, r.initialCostBasis])),
  );

  function buildEntries(qtys: Record<string, string>, basis: Record<string, CostBasis>): InventoryCaptureEntry[] {
    return rows.map((row) => ({
      type: row.type === "Producto" ? "product" : "subrecipe",
      id: row.id,
      quantity: qtys[row.key] ?? "",
      costBasis: basis[row.key],
    }));
  }

  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const lastSentRef = useRef<string>(JSON.stringify(buildEntries(quantities, costBasis)));

  useEffect(() => {
    const entries = buildEntries(quantities, costBasis);
    const snapshot = JSON.stringify(entries);
    if (snapshot === lastSentRef.current) return;

    const timer = setTimeout(async () => {
      lastSentRef.current = snapshot;
      setAutoSaveStatus("saving");
      const result = await autoSaveInventoryCount(countId, entries);
      if ("error" in result) {
        setAutoSaveStatus("error");
      } else {
        setAutoSaveStatus("saved");
        setLastSavedAt(new Date(result.savedAt));
      }
    }, 2000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantities, costBasis, countId]);

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasUncategorized };
  }, [rows]);

  function matchesFilter(row: CaptureRow): boolean {
    const q = search.trim().toLowerCase();
    if (q && !row.name.toLowerCase().includes(q)) return false;
    if (categoryFilter === "none" && row.categoryName !== null) return false;
    if (categoryFilter !== "all" && categoryFilter !== "none" && row.categoryName !== categoryFilter) {
      return false;
    }
    return true;
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleQuantityKeyDown(e: React.KeyboardEvent<HTMLTableCellElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    let row = (e.target as HTMLElement).closest("tr");
    while (row) {
      row = row.nextElementSibling as HTMLTableRowElement | null;
      if (row && !row.classList.contains("hidden")) {
        const nextInput = row.querySelector('input[type="number"]') as HTMLInputElement | null;
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
        break;
      }
    }
  }

  function quantityOf(row: CaptureRow): number {
    const raw = quantities[row.key];
    const n = Number(raw);
    return raw && !Number.isNaN(n) ? n : 0;
  }

  function unitCostOf(row: CaptureRow): number {
    return costBasis[row.key] === "gross" ? row.grossUnitCost : row.netUnitCost;
  }

  function sortValue(row: CaptureRow, key: SortKey): string | number | null {
    switch (key) {
      case "category":
        return row.categoryName ? row.categoryName.toLowerCase() : null;
      case "type":
        return row.type;
      case "name":
        return row.name.toLowerCase();
      case "unitCost":
        return unitCostOf(row);
      case "quantity":
        return quantityOf(row);
      case "total":
        return quantityOf(row) * unitCostOf(row);
    }
  }

  const sortedRows = useMemo(() => {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dirMultiplier;
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir, quantities, costBasis]);

  const grandTotal = useMemo(
    () => rows.reduce((sum, row) => sum + quantityOf(row) * unitCostOf(row), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, quantities, costBasis],
  );

  const boundSave = saveInventoryCount.bind(null, countId);
  const visibleCount = sortedRows.filter(matchesFilter).length;

  return (
    <form action={boundSave} className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4">
        <div>
          <p className="text-sm text-neutral-500">Valor de inventario</p>
          <p className="text-2xl font-semibold text-neutral-900">${grandTotal.toFixed(2)}</p>
        </div>
        <div className="flex items-center gap-3">
          {autoSaveStatus === "saving" && (
            <span className="text-xs text-neutral-400">Guardando automaticamente...</span>
          )}
          {autoSaveStatus === "saved" && lastSavedAt && (
            <span className="text-xs text-emerald-600">
              Autoguardado{" "}
              {lastSavedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {autoSaveStatus === "error" && (
            <span className="text-xs text-red-600" title="No se pudo autoguardar. Revisa tu conexion.">
              Error al autoguardar
            </span>
          )}
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Guardar conteo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorias</option>
          {categoryOptions.names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {categoryOptions.hasUncategorized && <option value="none">Sin categoria</option>}
        </select>
        {(search || categoryFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 hover:text-neutral-900"
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Todavia no hay productos ni subrecetas activos.
                </td>
              </tr>
            )}
            {sortedRows.length > 0 && visibleCount === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Ningun producto coincide con los filtros.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const qty = quantityOf(row);
              const basis = costBasis[row.key];
              const effectiveCost = unitCostOf(row);
              const hasYield = row.yieldPercentage !== 100;
              const inputName = row.type === "Producto" ? "product" : "subrecipe";
              const visible = matchesFilter(row);
              return (
                <tr
                  key={row.key}
                  className={visible ? "border-t border-neutral-100" : "hidden"}
                >
                  <td className="px-4 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        row.type === "Producto" ? "bg-neutral-100 text-neutral-600" : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input type="hidden" name={`basis:${inputName}:${row.id}`} value={basis} />
                    {effectiveCost === 0 ? (
                      <span className="text-amber-500" title="Sin costo capturado todavia.">
                        $0.0000 ⚠
                      </span>
                    ) : (
                      <span>${effectiveCost.toFixed(4)}</span>
                    )}
                    {hasYield && (
                      <select
                        value={basis}
                        onChange={(e) =>
                          setCostBasis((prev) => ({ ...prev, [row.key]: e.target.value as CostBasis }))
                        }
                        title={`Rendimiento configurado: ${row.yieldPercentage}%`}
                        className="ml-2 rounded border border-neutral-300 px-1 py-0.5 text-xs text-neutral-600"
                      >
                        <option value="net">Con rendimiento</option>
                        <option value="gross">De compra</option>
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2" onKeyDown={handleQuantityKeyDown}>
                    <input
                      type="hidden"
                      name={`qty:${inputName}:${row.id}`}
                      value={quantities[row.key] ?? ""}
                    />
                    <PresentationQuantityInput
                      baseUnit={row.baseUnit}
                      unitLabel={row.unitLabel}
                      presentations={row.presentations}
                      value={quantities[row.key] ?? ""}
                      onChange={(qty) => setQuantities((prev) => ({ ...prev, [row.key]: qty }))}
                    />
                  </td>
                  <td className="px-4 py-2 text-base font-bold text-neutral-900">
                    ${(qty * effectiveCost).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
