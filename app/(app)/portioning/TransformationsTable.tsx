"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { TransformationFilters, TransformationRow } from "@/lib/portioning/query";
import ApplyYieldButton from "./ApplyYieldButton";
import DeleteTransformationButton from "./DeleteTransformationButton";

type SortKey = "folio" | "date" | "product" | "yield";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "folio", label: "Folio" },
  { key: "date", label: "Fecha" },
  { key: "product", label: "Entro" },
  { key: "yield", label: "Rendimiento", align: "right" },
];

function sortValue(row: TransformationRow, key: SortKey): string | number {
  switch (key) {
    case "folio":
      return row.folio;
    case "date":
      return row.dateValue;
    case "product":
      return row.productName.toLowerCase();
    case "yield":
      return row.yieldPct;
  }
}

function qty(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

export default function TransformationsTable({
  rows,
  filters,
  isDefaultMonth,
  defaultFrom,
  defaultTo,
  truncated,
}: {
  rows: TransformationRow[];
  filters: TransformationFilters;
  isDefaultMonth: boolean;
  defaultFrom: string;
  defaultTo: string;
  truncated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [folioInput, setFolioInput] = useState(filters.folio);
  const [dateFrom, setDateFrom] = useState(isDefaultMonth ? defaultFrom : filters.dateFrom);
  const [dateTo, setDateTo] = useState(isDefaultMonth ? defaultTo : filters.dateTo);

  // Ordenar es cosa de la pantalla; filtrar vuelve al servidor, para que una busqueda no quede
  // acotada al lote que ya se habia traido.
  const [sortKey, setSortKey] = useState<SortKey>("folio");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function buildParams(next: Partial<TransformationFilters>): URLSearchParams {
    const merged: TransformationFilters = {
      search: next.search ?? searchInput,
      folio: next.folio ?? folioInput,
      dateFrom: next.dateFrom ?? dateFrom,
      dateTo: next.dateTo ?? dateTo,
    };
    const params = new URLSearchParams();
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.folio.trim()) params.set("folio", merged.folio.trim());
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    return params;
  }

  function navigate(next: Partial<TransformationFilters>) {
    const params = buildParams(next);
    // Una vez que se toca un filtro ya no se vuelve a imponer el mes en curso: si se limpian
    // las fechas, se ve todo el historial.
    params.set("touched", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (searchInput === filters.search) return;
    const timeout = setTimeout(() => navigate({ search: searchInput }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    if (folioInput === filters.folio) return;
    const timeout = setTimeout(() => {
      // Un folio identifica una sola transformacion: al buscarlo se limpian las fechas para no
      // esconderla si cae fuera del mes en curso.
      if (folioInput.trim()) {
        setDateFrom("");
        setDateTo("");
        navigate({ folio: folioInput, dateFrom: "", dateTo: "" });
      } else {
        navigate({ folio: folioInput });
      }
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioInput]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "product" ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const dirMultiplier = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dirMultiplier;
      }
      return ((va as number) - (vb as number)) * dirMultiplier;
    });
  }, [rows, sortKey, sortDir]);

  const exportHref = useMemo(() => {
    const params = buildParams({});
    return `/api/export/transformations?${params.toString()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, folioInput, dateFrom, dateTo]);

  const totalEntrada = sortedRows.reduce((sum, row) => sum + row.initialCost, 0);

  return (
    <div className="space-y-3">
      {truncated && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Se muestran las primeras 500. Acota el periodo o busca un producto para ver el resto.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar producto (entro o salio)..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={folioInput}
          onChange={(e) => setFolioInput(e.target.value)}
          placeholder="Buscar folio..."
          className="w-full max-w-[10rem] rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <div className="space-y-1">
          <label htmlFor="transformFrom" className="text-xs font-medium text-neutral-500">
            Desde
          </label>
          <input
            id="transformFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              navigate({ dateFrom: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="transformTo" className="text-xs font-medium text-neutral-500">
            Hasta
          </label>
          <input
            id="transformTo"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              navigate({ dateTo: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              navigate({ dateFrom: "", dateTo: "" });
            }}
            className="text-sm text-neutral-500 hover:underline"
          >
            Limpiar fechas
          </button>
        )}
        <a
          href={exportHref}
          className="ml-auto rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>

      <p className="text-sm text-neutral-500">
        {sortedRows.length} {sortedRows.length === 1 ? "transformacion" : "transformaciones"} ·{" "}
        {formatMoney(totalEntrada)} de producto transformado
      </p>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              {COLUMNS.slice(0, 3).map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1.5 transition-colors hover:text-neutral-900"
                  >
                    {col.label}
                    <span className={sortKey === col.key ? "text-brand-500" : "text-transparent"}>
                      {sortKey === col.key && sortDir === "desc" ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Salio</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                <button
                  type="button"
                  onClick={() => handleSort("yield")}
                  className="ml-auto flex items-center gap-1.5 transition-colors hover:text-neutral-900"
                >
                  Rendimiento
                  <span className={sortKey === "yield" ? "text-brand-500" : "text-transparent"}>
                    {sortKey === "yield" && sortDir === "desc" ? "▼" : "▲"}
                  </span>
                </button>
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Ninguna transformacion coincide con los filtros.
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const aplicable = row.yieldPct > 0 && row.yieldPct <= 100;
              return (
                <tr
                  key={row.id}
                  className="border-t border-neutral-100 align-top transition-colors hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 text-neutral-500">{row.folioLabel}</td>
                  <td className="px-4 py-3 text-neutral-500">{row.dateLabel}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{row.productName}</p>
                    <p className="text-xs text-neutral-500">
                      {qty(row.initialQty)} {row.initialUnitLabel}
                      {" · "}
                      {formatMoney(row.initialCost, 2)}
                    </p>
                    {row.comment && <p className="mt-0.5 text-xs text-neutral-500">{row.comment}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {row.outputs.map((output) => (
                      <p key={output.id}>
                        {qty(output.qty)}{" "}
                        {output.unitLabel && (
                          <span className="text-neutral-400">{output.unitLabel} </span>
                        )}
                        de {output.name}
                        {output.unitCost > 0 && (
                          <span className="text-neutral-400">
                            {" · "}
                            {formatMoney(output.unitCost, 2)} c/u
                          </span>
                        )}
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        row.yieldPct > 100
                          ? "font-medium tabular-nums text-amber-600"
                          : row.yieldPct < 50
                            ? "font-medium tabular-nums text-red-600"
                            : row.yieldPct < 75
                              ? "font-medium tabular-nums text-amber-600"
                              : "font-medium tabular-nums text-neutral-900"
                      }
                    >
                      {row.yieldPct.toFixed(2)}%
                    </span>
                    {row.yieldPct > 100 && (
                      <p className="text-xs text-amber-600">salio mas de lo que entro</p>
                    )}
                    {aplicable && (
                      <div className="mt-1">
                        <ApplyYieldButton
                          entryId={row.id}
                          productName={row.productName}
                          yieldPct={row.yieldPct}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteTransformationButton
                      entryId={row.id}
                      folioLabel={row.folioLabel}
                      resumen={`${qty(row.initialQty)} ${row.initialUnitLabel} de ${row.productName}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
