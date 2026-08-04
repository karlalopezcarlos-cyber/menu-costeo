"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  computeCostTrends,
  sortPurchaseRows,
  type CostTrend,
  type PurchaseRow,
  type PurchaseSortKey,
  type SortDir,
} from "./purchase-rows";
import { formatMoney } from "@/lib/format";

const TREND_STYLE: Record<CostTrend, { dot: string; title: string }> = {
  up: { dot: "bg-red-500", title: "Por encima del promedio de este producto en lo filtrado" },
  down: { dot: "bg-blue-500", title: "Por debajo del promedio de este producto en lo filtrado" },
  flat: { dot: "bg-neutral-300", title: "Igual al promedio de este producto en lo filtrado" },
};

export type { PurchaseRow };

export type PurchaseListFilterValues = {
  search: string;
  folio: string;
  dateFrom: string;
  dateTo: string;
  pendingOnly: boolean;
  supplier: string;
};

const COLUMNS: { key: PurchaseSortKey; label: string }[] = [
  { key: "folio", label: "Folio" },
  { key: "date", label: "Fecha" },
  { key: "product", label: "Producto" },
  { key: "quantity", label: "Cantidad" },
  { key: "supplier", label: "Proveedor" },
  { key: "price", label: "Precio" },
  { key: "cost", label: "Costo unitario resultante" },
];

export default function PurchasesTable({
  rows,
  supplierOptions,
  filters,
  isDefaultToday,
  today,
  truncated,
}: {
  rows: PurchaseRow[];
  supplierOptions: string[];
  filters: PurchaseListFilterValues;
  isDefaultToday: boolean;
  today: string;
  truncated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Orden por folio descendente para que la compra mas reciente quede siempre arriba, sin
  // depender de que las fechas de compra sean distintas entre si.
  const [sortKey, setSortKey] = useState<PurchaseSortKey>("folio");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // El filtrado (busqueda, folio, fechas, proveedor, pendientes) ya no se hace en el navegador:
  // cada cambio navega con los parametros nuevos en la URL para que el servidor vuelva a
  // consultar la base de datos, en vez de acotar sobre un lote fijo ya traido. Esto evita que
  // busquedas de compras viejas queden fuera de un limite arbitrario conforme crece el historial.
  const [searchInput, setSearchInput] = useState(filters.search);
  const [folioInput, setFolioInput] = useState(filters.folio);
  const [dateFrom, setDateFrom] = useState(isDefaultToday ? today : filters.dateFrom);
  const [dateTo, setDateTo] = useState(isDefaultToday ? today : filters.dateTo);
  const [pendingOnly, setPendingOnly] = useState(filters.pendingOnly);
  const [supplierFilter, setSupplierFilter] = useState(filters.supplier);

  function navigate(next: Partial<PurchaseListFilterValues>) {
    const merged: PurchaseListFilterValues = {
      search: next.search ?? searchInput,
      folio: next.folio ?? folioInput,
      dateFrom: next.dateFrom ?? dateFrom,
      dateTo: next.dateTo ?? dateTo,
      pendingOnly: next.pendingOnly ?? pendingOnly,
      supplier: next.supplier ?? supplierFilter,
    };
    const params = new URLSearchParams();
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.folio.trim()) params.set("folio", merged.folio.trim());
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    if (merged.pendingOnly) params.set("pendingOnly", "1");
    if (merged.supplier) params.set("supplier", merged.supplier);
    // Una vez que el usuario toca cualquier filtro, ya no se vuelve a aplicar el default de "hoy":
    // si limpia las fechas, se queda viendo todo el historial en vez de regresar a hoy.
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
      // Un folio ya identifica una sola compra: al buscarlo se limpia el filtro de fecha (que
      // puede seguir mostrando "hoy" en pantalla) para no ocultar compras de otros dias.
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

  function handleSort(key: PurchaseSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => sortPurchaseRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  // La tendencia se calcula sobre las filas ya filtradas por el servidor, para que refleje el
  // comportamiento del costo dentro de lo que se esta viendo, sin importar el orden elegido.
  const costTrends = useMemo(() => computeCostTrends(rows), [rows]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    if (folioInput.trim()) params.set("folio", folioInput.trim());
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (pendingOnly) params.set("pendingOnly", "1");
    if (supplierFilter) params.set("supplier", supplierFilter);
    params.set("sortKey", sortKey);
    params.set("sortDir", sortDir);
    return `/api/export/purchases?${params.toString()}`;
  }, [searchInput, folioInput, dateFrom, dateTo, pendingOnly, supplierFilter, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      {truncated && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Se muestran los primeros 500 resultados. Agrega mas filtros (fecha, folio, producto) para acotar la
          busqueda.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={folioInput}
          onChange={(e) => setFolioInput(e.target.value)}
          placeholder="Buscar folio..."
          className="w-full max-w-[10rem] rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <div className="space-y-1">
          <label htmlFor="dateFrom" className="text-xs font-medium text-neutral-500">
            Desde
          </label>
          <input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              navigate({ dateFrom: e.target.value });
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="dateTo" className="text-xs font-medium text-neutral-500">
            Hasta
          </label>
          <input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              navigate({ dateTo: e.target.value });
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
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
        <div className="space-y-1">
          <label htmlFor="supplierFilter" className="text-xs font-medium text-neutral-500">
            Proveedor
          </label>
          <select
            id="supplierFilter"
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              navigate({ supplier: e.target.value });
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los proveedores</option>
            {supplierOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => {
              setPendingOnly(e.target.checked);
              navigate({ pendingOnly: e.target.checked });
            }}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Productos con pedido pendiente
        </label>
        <a
          href={exportHref}
          className="ml-auto rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              {COLUMNS.slice(0, 4).map((column) => (
                <th key={column.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1 hover:text-neutral-900"
                  >
                    {column.label}
                    {sortKey === column.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Unidad</th>
              {COLUMNS.slice(4).map((column) => (
                <th key={column.key} className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort(column.key)}
                    className="flex items-center gap-1 hover:text-neutral-900"
                  >
                    {column.label}
                    {sortKey === column.key && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                  {isDefaultToday
                    ? "No se registraron compras hoy."
                    : "Ninguna compra coincide con los filtros."}
                </td>
              </tr>
            )}
            {sortedRows.map((purchase) => (
              <tr key={purchase.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-500">
                  <Link href={`/purchases/${purchase.folio}`} className="text-neutral-700 hover:underline">
                    {purchase.folioLabel}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">{purchase.dateLabel}</td>
                <td className="px-4 py-2">
                  {purchase.productName}
                  {purchase.note && <p className="mt-0.5 text-xs text-amber-600">{purchase.note}</p>}
                </td>
                <td className="px-4 py-2 text-neutral-500">{purchase.quantityLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{purchase.unitLabel}</td>
                <td className="px-4 py-2 text-neutral-500">{purchase.supplierName ?? "-"}</td>
                <td className="px-4 py-2">{formatMoney(purchase.totalPrice)}</td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1.5 inline-flex w-2 shrink-0 justify-center">
                      {(() => {
                        const trend = costTrends.get(purchase.id);
                        if (!trend) return null;
                        const style = TREND_STYLE[trend];
                        return (
                          <span
                            title={style.title}
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                          />
                        );
                      })()}
                    </span>
                    {purchase.unitCostLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
