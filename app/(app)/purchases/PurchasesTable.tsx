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
import { SIN_ASIGNAR } from "@/lib/purchases/filters";
import { emptyBreakdown, type TaxBreakdown } from "@/lib/taxes";

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
  category: string;
  costGroup: string;
};

export type CategoryOption = { name: string; groupName: string | null };

const COLUMNS: { key: PurchaseSortKey; label: string }[] = [
  { key: "folio", label: "Factura" },
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
  categoryOptions,
  filteredTaxes,
  filteredCount,
  filters,
  isDefaultToday,
  today,
  truncated,
}: {
  rows: PurchaseRow[];
  supplierOptions: string[];
  categoryOptions: CategoryOption[];
  /** Subtotal, IEPS, IVA y total de TODO lo filtrado, sumados en la base: no dependen del tope
   *  de filas en pantalla. */
  filteredTaxes: TaxBreakdown;
  /** Cuantas compras hay en lo filtrado, tambien de la base. */
  filteredCount: number;
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
  const [categoryFilter, setCategoryFilter] = useState(filters.category);
  const [costGroupFilter, setCostGroupFilter] = useState(filters.costGroup);

  // Se guarda lo DESCARTADO y no lo seleccionado: lo normal es querer todo lo filtrado y quitar
  // dos o tres renglones. Guardado al reves, cada cambio de filtro tendria que volver a marcar
  // cientos de ids, y los que no alcanzaron a caber en pantalla no se podrian marcar nunca.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Al cambiar el filtro, la seleccion se suelta: conservar descartes de una busqueda anterior
  // restaria renglones que ya ni se estan viendo. Se ajusta durante el render y no en un efecto
  // para no pintar primero el total viejo y corregirlo despues.
  const [rowsVistas, setRowsVistas] = useState(rows);
  if (rowsVistas !== rows) {
    setRowsVistas(rows);
    setExcludedIds(new Set());
  }

  function toggleRow(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function navigate(next: Partial<PurchaseListFilterValues>) {
    const merged: PurchaseListFilterValues = {
      search: next.search ?? searchInput,
      folio: next.folio ?? folioInput,
      dateFrom: next.dateFrom ?? dateFrom,
      dateTo: next.dateTo ?? dateTo,
      pendingOnly: next.pendingOnly ?? pendingOnly,
      supplier: next.supplier ?? supplierFilter,
      category: next.category ?? categoryFilter,
      costGroup: next.costGroup ?? costGroupFilter,
    };
    const params = new URLSearchParams();
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.folio.trim()) params.set("folio", merged.folio.trim());
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    if (merged.pendingOnly) params.set("pendingOnly", "1");
    if (merged.supplier) params.set("supplier", merged.supplier);
    if (merged.category) params.set("category", merged.category);
    if (merged.costGroup) params.set("costGroup", merged.costGroup);
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

  const groupOptions = useMemo(() => {
    const names = new Set<string>();
    for (const option of categoryOptions) if (option.groupName) names.add(option.groupName);
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [categoryOptions]);

  const hayCategoriaSinGrupo = useMemo(
    () => categoryOptions.some((option) => option.groupName === null),
    [categoryOptions],
  );

  // Con un grupo elegido, el selector de categoria solo ofrece las de ese grupo: la lista
  // completa deja elegir combinaciones que no pueden dar ninguna compra.
  const visibleCategories = useMemo(() => {
    if (!costGroupFilter) return categoryOptions;
    if (costGroupFilter === SIN_ASIGNAR) return categoryOptions.filter((o) => o.groupName === null);
    return categoryOptions.filter((o) => o.groupName === costGroupFilter);
  }, [categoryOptions, costGroupFilter]);

  // La tendencia se calcula sobre las filas ya filtradas por el servidor, para que refleje el
  // comportamiento del costo dentro de lo que se esta viendo, sin importar el orden elegido.
  const costTrends = useMemo(() => computeCostTrends(rows), [rows]);

  // Se recorren las filas y no el set: asi un id que quedo de un filtro anterior no resta nada
  // ni se cuenta, pase lo que pase con el momento en que se suelta la seleccion.
  const descartado = useMemo(() => {
    const taxes = emptyBreakdown();
    let count = 0;
    for (const row of rows) {
      if (!excludedIds.has(row.id)) continue;
      taxes.subtotal += row.taxes.subtotal;
      taxes.ieps += row.taxes.ieps;
      taxes.iva += row.taxes.iva;
      taxes.total += row.taxes.total;
      count += 1;
    }
    return { taxes, count };
  }, [rows, excludedIds]);
  const seleccionado: TaxBreakdown = {
    subtotal: filteredTaxes.subtotal - descartado.taxes.subtotal,
    ieps: filteredTaxes.ieps - descartado.taxes.ieps,
    iva: filteredTaxes.iva - descartado.taxes.iva,
    total: filteredTaxes.total - descartado.taxes.total,
  };
  const hayImpuestos = seleccionado.iva !== 0 || seleccionado.ieps !== 0;
  const todosDescartados = rows.length > 0 && descartado.count === rows.length;

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set("q", searchInput.trim());
    if (folioInput.trim()) params.set("folio", folioInput.trim());
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (pendingOnly) params.set("pendingOnly", "1");
    if (supplierFilter) params.set("supplier", supplierFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (costGroupFilter) params.set("costGroup", costGroupFilter);
    params.set("sortKey", sortKey);
    params.set("sortDir", sortDir);
    return `/api/export/purchases?${params.toString()}`;
  }, [
    searchInput,
    folioInput,
    dateFrom,
    dateTo,
    pendingOnly,
    supplierFilter,
    categoryFilter,
    costGroupFilter,
    sortKey,
    sortDir,
  ]);

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
          placeholder="Buscar producto o folio de factura..."
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
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
        <div className="space-y-1">
          <label htmlFor="costGroupFilter" className="text-xs font-medium text-neutral-500">
            Grupo
          </label>
          <select
            id="costGroupFilter"
            value={costGroupFilter}
            onChange={(e) => {
              const value = e.target.value;
              setCostGroupFilter(value);
              // Si la categoria elegida no pertenece al grupo nuevo, se suelta: dejarla puesta
              // mostraria la lista vacia sin que se vea por que.
              const sigueValiendo =
                !categoryFilter ||
                categoryFilter === SIN_ASIGNAR ||
                !value ||
                categoryOptions.some(
                  (o) =>
                    o.name === categoryFilter &&
                    (value === SIN_ASIGNAR ? o.groupName === null : o.groupName === value),
                );
              const category = sigueValiendo ? categoryFilter : "";
              if (!sigueValiendo) setCategoryFilter("");
              navigate({ costGroup: value, category });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Todos los grupos</option>
            {groupOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {hayCategoriaSinGrupo && <option value={SIN_ASIGNAR}>Sin grupo</option>}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="categoryFilter" className="text-xs font-medium text-neutral-500">
            Categoria
          </label>
          <select
            id="categoryFilter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              navigate({ category: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Todas las categorias</option>
            {visibleCategories.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
            <option value={SIN_ASIGNAR}>Sin categoria</option>
          </select>
        </div>
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
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
          className="ml-auto rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {hayImpuestos ? "Subtotal" : "Total filtrado"}
            </span>
            <span className="text-xl font-semibold tabular-nums text-neutral-900">
              {formatMoney(seleccionado.subtotal)}
            </span>
          </div>
          {/* El desglose solo aparece cuando hay algo que desglosar: en un filtro de puros
              productos en tasa 0 serian tres ceros estorbando. */}
          {hayImpuestos && (
            <>
              {seleccionado.ieps !== 0 && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    IEPS
                  </span>
                  <span className="text-sm tabular-nums text-neutral-600">
                    {formatMoney(seleccionado.ieps)}
                  </span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  IVA
                </span>
                <span className="text-sm tabular-nums text-neutral-600">
                  {formatMoney(seleccionado.iva)}
                </span>
              </div>
              <div
                className="flex items-baseline gap-2"
                title="Lo que se le paga al proveedor. El costo del negocio es el subtotal: el IVA es acreditable."
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Total con impuestos
                </span>
                <span className="text-xl font-semibold tabular-nums text-neutral-900">
                  {formatMoney(seleccionado.total)}
                </span>
              </div>
            </>
          )}
        </div>
        <p className="text-sm text-neutral-500">
          {filteredCount - descartado.count} de {filteredCount}{" "}
          {filteredCount === 1 ? "compra" : "compras"}
          {descartado.count > 0 && (
            <span className="text-neutral-400">
              {" "}
              · {descartado.count} sin contar (−{formatMoney(descartado.taxes.subtotal)})
            </span>
          )}
          {truncated && (
            <span className="text-amber-600">
              {" "}
              · el total cuenta las {filteredCount}, aunque en pantalla solo caben {rows.length}
            </span>
          )}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={todosDescartados ? "Contar todo" : "No contar nada"}
                  title={todosDescartados ? "Contar todo" : "No contar nada"}
                  checked={!todosDescartados}
                  disabled={rows.length === 0}
                  onChange={() =>
                    setExcludedIds(todosDescartados ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              {COLUMNS.slice(0, 4).map((column) => (
                <th key={column.key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
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
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Unidad</th>
              {COLUMNS.slice(4).map((column) => (
                <th key={column.key} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
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
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  {isDefaultToday
                    ? "No se registraron compras hoy."
                    : "Ninguna compra coincide con los filtros."}
                </td>
              </tr>
            )}
            {sortedRows.map((purchase) => (
              <tr
                key={purchase.id}
                className={`border-t border-neutral-100 transition-colors hover:bg-neutral-50 ${
                  excludedIds.has(purchase.id) ? "text-neutral-400 opacity-60" : ""
                }`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Contar ${purchase.productName} en el total`}
                    checked={!excludedIds.has(purchase.id)}
                    onChange={() => toggleRow(purchase.id)}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                </td>
                <td className="px-4 py-3">
                  {/* El folio de la factura manda: es el que el usuario trae en el papel. El
                      consecutivo del sistema queda abajo, para poder rastrear el registro. */}
                  {purchase.invoiceFolio && purchase.invoiceFolio !== purchase.folioLabel ? (
                    <>
                      <Link
                        href={`/purchases/${purchase.folio}`}
                        className="font-medium text-neutral-900 transition-colors hover:text-brand-600"
                      >
                        {purchase.invoiceFolio}
                      </Link>
                      <p className="mt-0.5 text-xs text-neutral-400">{purchase.folioLabel}</p>
                    </>
                  ) : (
                    <Link
                      href={`/purchases/${purchase.folio}`}
                      className="font-medium text-neutral-900 transition-colors hover:text-brand-600"
                    >
                      {purchase.folioLabel}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{purchase.dateLabel}</td>
                <td className="px-4 py-3">
                  {purchase.productName}
                  {purchase.note && <p className="mt-0.5 text-xs text-amber-600">{purchase.note}</p>}
                </td>
                <td className="px-4 py-3 text-neutral-500">{purchase.quantityLabel}</td>
                <td className="px-4 py-3 text-neutral-500">{purchase.unitLabel}</td>
                <td className="px-4 py-3 text-neutral-500">{purchase.supplierName ?? "-"}</td>
                <td className="px-4 py-3">{formatMoney(purchase.totalPrice)}</td>
                <td className="px-4 py-3">
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
