"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AuditRow } from "@/lib/audit";
import { filterAuditRows, sumVarianceAmounts } from "@/lib/audit-filters";
import { saveAuditComments } from "./actions";
import { formatMoney } from "@/lib/format";

type SortKey =
  | "category"
  | "type"
  | "name"
  | "initial"
  | "purchases"
  | "produced"
  | "waste"
  | "productionConsumed"
  | "sales"
  | "theoretical"
  | "actual"
  | "variance"
  | "varianceAmount"
  | "previousVarianceQty";
type SortDir = "asc" | "desc";

/** Ancho de cada columna en % del ancho total de la tabla; junto con VARIANCE_PCT_WIDTH y
 * COMMENT_WIDTH deben sumar 100, para que la tabla (table-fixed) siempre quepa en el ancho
 * disponible sin necesitar scroll horizontal. */
const COLUMNS: { key: SortKey; label: string; width: number }[] = [
  { key: "category", label: "Categoria", width: 6 },
  { key: "type", label: "Tipo", width: 5 },
  { key: "name", label: "Nombre", width: 12 },
  { key: "initial", label: "Inicial", width: 6 },
  { key: "purchases", label: "+ Compras", width: 6 },
  { key: "produced", label: "+ Produccion", width: 6 },
  { key: "waste", label: "- Mermas", width: 6 },
  { key: "productionConsumed", label: "- Produccion", width: 6 },
  { key: "sales", label: "- Ventas", width: 6 },
  { key: "theoretical", label: "= Teorico", width: 6 },
  { key: "actual", label: "Real (final)", width: 6 },
  { key: "variance", label: "Variacion", width: 6 },
  { key: "previousVarianceQty", label: "Variacion anterior", width: 6 },
  { key: "varianceAmount", label: "Variacion $", width: 6 },
];
const VARIANCE_PCT_WIDTH = 4;
const COMMENT_WIDTH = 7;

function fmt(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function fmtMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(n))}`;
}

/** Ej. "150 ML" -> "150 ML (0.20 Botella)" cuando el producto tiene presentacion fija configurada. */
function presentationSuffix(row: AuditRow, qty: number): string {
  if (!row.presentationUnitQty) return "";
  const count = qty / row.presentationUnitQty;
  return ` (${count.toFixed(2)} ${row.presentationUnitLabel})`;
}

export default function AuditTable({
  rows,
  initialCountId,
  finalCountId,
}: {
  rows: AuditRow[];
  initialCountId: string;
  finalCountId: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "product" | "subrecipe">("all");
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [onlyWithComment, setOnlyWithComment] = useState(false);

  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const row of rows) {
      if (row.categoryName) names.add(row.categoryName);
      else hasUncategorized = true;
    }
    return { names: [...names].sort((a, b) => a.localeCompare(b)), hasUncategorized };
  }, [rows]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortValue(row: AuditRow, key: SortKey): string | number | null {
    switch (key) {
      case "category":
        return row.categoryName ? row.categoryName.toLowerCase() : null;
      case "type":
        return row.itemType;
      case "name":
        return row.name.toLowerCase();
      case "initial":
        return row.initialQty;
      case "purchases":
        return row.purchasesQty;
      case "produced":
        return row.producedQty;
      case "waste":
        return row.wasteQty;
      case "productionConsumed":
        return row.productionConsumedQty;
      case "sales":
        return row.salesQty;
      case "theoretical":
        return row.theoreticalFinalQty;
      case "actual":
        return row.actualFinalQty;
      case "variance":
        return row.varianceQty;
      case "varianceAmount":
        return row.varianceAmount;
      case "previousVarianceQty":
        return row.previousVarianceQty;
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
  }, [rows, sortKey, sortDir]);

  const visibleRows = useMemo(
    () => filterAuditRows(sortedRows, { search, typeFilter, categoryFilter, onlyDifferences, onlyWithComment }),
    [sortedRows, search, categoryFilter, typeFilter, onlyDifferences, onlyWithComment],
  );

  const { totalShortageAmount, totalSurplusAmount } = useMemo(() => sumVarianceAmounts(visibleRows), [visibleRows]);

  const hasFilters =
    !!search || categoryFilter !== "all" || typeFilter !== "all" || onlyDifferences || onlyWithComment;
  const colCount = COLUMNS.length + 2;

  const boundSaveComments = finalCountId ? saveAuditComments.bind(null, finalCountId) : null;

  const pdfParams = new URLSearchParams({
    initial: initialCountId,
    type: typeFilter,
    category: categoryFilter,
    onlyDifferences: String(onlyDifferences),
    onlyWithComment: String(onlyWithComment),
  });
  if (finalCountId) pdfParams.set("final", finalCountId);
  if (search.trim()) pdfParams.set("search", search.trim());
  const pdfHref = `/api/export/audit/pdf?${pdfParams.toString()}`;

  const filterBar = (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar producto o subreceta..."
        className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="all">Productos y subrecetas</option>
        <option value="product">Solo productos</option>
        <option value="subrecipe">Solo subrecetas</option>
      </select>
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
      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={onlyDifferences}
          onChange={(e) => setOnlyDifferences(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Solo con movimiento o variacion
      </label>
      <label className="flex items-center gap-1.5 text-sm text-neutral-600">
        <input
          type="checkbox"
          checked={onlyWithComment}
          onChange={(e) => setOnlyWithComment(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Solo con comentario en la variacion
      </label>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setCategoryFilter("all");
            setTypeFilter("all");
            setOnlyDifferences(false);
            setOnlyWithComment(false);
          }}
          className="text-sm text-neutral-500 hover:underline"
        >
          Quitar filtros
        </button>
      )}
      <a
        href={pdfHref}
        className="ml-auto rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Exportar seleccion a PDF
      </a>
    </div>
  );

  const table = (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.key} style={{ width: `${col.width}%` }} />
          ))}
          <col style={{ width: `${VARIANCE_PCT_WIDTH}%` }} />
          <col style={{ width: `${COMMENT_WIDTH}%` }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-neutral-800 text-left text-white">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className="px-2 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort(col.key)}
                  className="flex w-full min-w-0 items-center gap-1 text-left hover:text-neutral-200"
                >
                  <span className="break-words">{col.label}</span>
                  {sortKey === col.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </button>
              </th>
            ))}
            <th className="px-2 py-2 font-medium">Variacion %</th>
            <th className="px-2 py-2 font-medium">Comentario</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-6 text-center text-neutral-400">
                Todavia no hay productos ni subrecetas activos.
              </td>
            </tr>
          )}
          {rows.length > 0 && visibleRows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-6 text-center text-neutral-400">
                Ningun resultado coincide con los filtros.
              </td>
            </tr>
          )}
          {visibleRows.map((row) => {
            const hasVariance = row.varianceQty !== null;
            const varianceIsSignificant = hasVariance && Math.abs(row.varianceQty as number) > 0.001;
            const kardexParams = new URLSearchParams({ initial: initialCountId, type: row.itemType });
            if (finalCountId) kardexParams.set("final", finalCountId);
            const kardexHref = `/audit/${row.itemId}?${kardexParams.toString()}`;
            const inputName = `comment:${row.itemType}:${row.itemId}`;
            return (
              <tr key={`${row.itemType}-${row.itemId}`} className="border-t border-neutral-100">
                <td className="px-2 py-2 text-neutral-500">{row.categoryName ?? "-"}</td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      row.itemType === "product" ? "bg-neutral-100 text-neutral-600" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {row.itemType === "product" ? "Producto" : "Subreceta"}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <Link href={kardexHref} target="_blank" className="hover:underline" title="Ver kardex de movimientos">
                    {row.name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-neutral-500">
                  {fmt(row.initialQty)} {row.unitLabel}
                  {presentationSuffix(row, row.initialQty)}
                </td>
                <td className="px-2 py-2 text-emerald-700">
                  {row.purchasesQty !== 0
                    ? `+${fmt(row.purchasesQty)}${presentationSuffix(row, row.purchasesQty)}`
                    : "-"}
                </td>
                <td className="px-2 py-2 text-emerald-700">
                  {row.producedQty !== 0
                    ? `+${fmt(row.producedQty)}${presentationSuffix(row, row.producedQty)}`
                    : "-"}
                </td>
                <td className="px-2 py-2 text-red-600">
                  {row.wasteQty !== 0 ? `-${fmt(row.wasteQty)}${presentationSuffix(row, row.wasteQty)}` : "-"}
                </td>
                <td className="px-2 py-2 text-red-600">
                  {row.productionConsumedQty !== 0
                    ? `-${fmt(row.productionConsumedQty)}${presentationSuffix(row, row.productionConsumedQty)}`
                    : "-"}
                </td>
                <td className="px-2 py-2 text-red-600">
                  {row.salesQty !== 0 ? `-${fmt(row.salesQty)}${presentationSuffix(row, row.salesQty)}` : "-"}
                </td>
                <td className="px-2 py-2 font-medium">
                  {fmt(row.theoreticalFinalQty)} {row.unitLabel}
                  {presentationSuffix(row, row.theoreticalFinalQty)}
                </td>
                <td className="px-2 py-2 text-neutral-500">
                  {row.actualFinalQty !== null
                    ? `${fmt(row.actualFinalQty)} ${row.unitLabel}${presentationSuffix(row, row.actualFinalQty)}`
                    : "-"}
                </td>
                <td
                  className={`px-2 py-2 font-medium ${
                    !hasVariance
                      ? "text-neutral-300"
                      : !varianceIsSignificant
                        ? "text-neutral-400"
                        : (row.varianceQty as number) < 0
                          ? "text-red-600"
                          : "text-emerald-700"
                  }`}
                >
                  {row.varianceQty !== null
                    ? `${row.varianceQty > 0 ? "+" : ""}${fmt(row.varianceQty)} ${row.unitLabel}${presentationSuffix(row, row.varianceQty)}`
                    : "-"}
                </td>
                <td
                  className={`px-2 py-2 ${
                    row.previousVarianceQty === null
                      ? "text-neutral-300"
                      : Math.abs(row.previousVarianceQty) <= 0.001
                        ? "text-neutral-400"
                        : row.previousVarianceQty < 0
                          ? "text-red-600"
                          : "text-emerald-700"
                  }`}
                  title="Variacion del periodo anterior (con el mismo conteo, pero comparado contra el conteo previo a este)"
                >
                  {row.previousVarianceQty !== null
                    ? `${row.previousVarianceQty > 0 ? "+" : ""}${fmt(row.previousVarianceQty)} ${row.unitLabel}${presentationSuffix(row, row.previousVarianceQty)}`
                    : "-"}
                </td>
                <td
                  className={`px-2 py-2 font-medium ${
                    row.varianceAmount === null
                      ? "text-neutral-300"
                      : !varianceIsSignificant
                        ? "text-neutral-400"
                        : row.varianceAmount < 0
                          ? "text-red-600"
                          : "text-emerald-700"
                  }`}
                >
                  {row.varianceAmount !== null ? fmtMoney(row.varianceAmount) : "-"}
                </td>
                <td className="px-2 py-2 text-neutral-500">
                  {row.variancePct !== null ? `${row.variancePct > 0 ? "+" : ""}${row.variancePct.toFixed(1)}%` : "-"}
                </td>
                <td className="px-2 py-2">
                  {finalCountId ? (
                    <input
                      name={inputName}
                      defaultValue={row.comment ?? ""}
                      placeholder="Explica la variacion..."
                      className="w-full min-w-0 rounded-md border border-neutral-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="text-xs text-neutral-300">Sin conteo final</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (!boundSaveComments) {
    return (
      <div className="space-y-3">
        {filterBar}
        {table}
      </div>
    );
  }

  const cards = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-500">Monto total de faltantes</p>
        <p className="mt-1 text-2xl font-semibold text-red-600">-{formatMoney(totalShortageAmount)}</p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="text-sm text-neutral-500">Monto total de sobrantes</p>
        <p className="mt-1 text-2xl font-semibold text-emerald-700">+{formatMoney(totalSurplusAmount)}</p>
      </div>
    </div>
  );

  return (
    <form action={boundSaveComments} className="space-y-3">
      {cards}
      {filterBar}
      {table}
      <button
        type="submit"
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Guardar comentarios
      </button>
    </form>
  );
}
