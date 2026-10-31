"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { deletePurchaseGroupFromList } from "./[folio]/actions";
import type { InvoiceFilters, InvoiceRow, SupplierTotal } from "@/lib/purchases/invoices";

export default function InvoicesTable({
  rows,
  bySupplier,
  invoiceCount,
  total,
  supplierOptions,
  filters,
  isDefaultMonth,
  defaultFrom,
  defaultTo,
}: {
  rows: InvoiceRow[];
  bySupplier: SupplierTotal[];
  invoiceCount: number;
  total: number;
  supplierOptions: string[];
  filters: InvoiceFilters;
  isDefaultMonth: boolean;
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [pending, startTransition] = useTransition();
  const [deletingFolio, setDeletingFolio] = useState<number | null>(null);
  const [blockedDelete, setBlockedDelete] = useState<{ message: string; paymentHref: string } | null>(
    null,
  );

  const [searchInput, setSearchInput] = useState(filters.search);
  const [dateFrom, setDateFrom] = useState(isDefaultMonth ? defaultFrom : filters.dateFrom);
  const [dateTo, setDateTo] = useState(isDefaultMonth ? defaultTo : filters.dateTo);
  const [supplierFilter, setSupplierFilter] = useState(filters.supplier);

  function navigate(next: Partial<InvoiceFilters>) {
    const merged: InvoiceFilters = {
      search: next.search ?? searchInput,
      dateFrom: next.dateFrom ?? dateFrom,
      dateTo: next.dateTo ?? dateTo,
      supplier: next.supplier ?? supplierFilter,
    };
    const params = new URLSearchParams();
    params.set("tab", "facturas");
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    if (merged.supplier) params.set("supplier", merged.supplier);
    // Igual que en la lista por producto: en cuanto se toca un filtro ya no se vuelve a imponer
    // el periodo por omision, para poder ver todo el historial si se limpian las fechas.
    params.set("touched", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (searchInput === filters.search) return;
    const timeout = setTimeout(() => navigate({ search: searchInput }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function eliminar(row: InvoiceRow) {
    const etiqueta =
      row.invoiceFolio && row.invoiceFolio !== row.folioLabel
        ? `${row.invoiceFolio} (${row.folioLabel})`
        : row.folioLabel;
    if (
      !confirm(
        `¿Eliminar la compra ${etiqueta} de ${row.supplierName ?? "sin proveedor"}?\n\n` +
          `Se borran sus ${row.lineCount} producto${row.lineCount === 1 ? "" : "s"} por ${formatMoney(row.total)} ` +
          `y se recalcula el costo de cada uno. Esta accion no se puede deshacer.`,
      )
    ) {
      return;
    }
    setBlockedDelete(null);
    setDeletingFolio(row.folio);
    startTransition(async () => {
      const result = await deletePurchaseGroupFromList(row.folio);
      setDeletingFolio(null);
      if (result?.error) {
        setBlockedDelete({ message: result.error, paymentHref: result.paymentHref ?? "/payments" });
      }
    });
  }

  return (
    <div className="space-y-3">
      {blockedDelete && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{blockedDelete.message}</p>
          <Link
            href={blockedDelete.paymentHref}
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
          >
            Ir a Pagos
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar folio de factura..."
          className="w-full max-w-xs rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <div className="space-y-1">
          <label htmlFor="invoiceFrom" className="text-xs font-medium text-neutral-500">
            Desde
          </label>
          <input
            id="invoiceFrom"
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
          <label htmlFor="invoiceTo" className="text-xs font-medium text-neutral-500">
            Hasta
          </label>
          <input
            id="invoiceTo"
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
          <label htmlFor="invoiceSupplier" className="text-xs font-medium text-neutral-500">
            Proveedor
          </label>
          <select
            id="invoiceSupplier"
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Facturas
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {invoiceCount}
          </p>
          <p className="mt-1 text-xs text-neutral-500">En el periodo filtrado</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Total comprado
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {formatMoney(total)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Suma de todas las facturas</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Proveedores
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {bySupplier.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Distintos en el periodo</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Proveedor
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Facturas
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {bySupplier.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  No hay compras en el periodo.
                </td>
              </tr>
            )}
            {bySupplier.map((supplier) => (
              <tr key={supplier.supplierName} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">{supplier.supplierName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                  {supplier.invoiceCount}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatMoney(supplier.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Factura</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Fecha</th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Proveedor</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Productos
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Total
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Ninguna factura coincide con los filtros.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.folio} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/purchases/${row.folio}`}
                    className="font-medium text-neutral-900 transition-colors hover:text-brand-600"
                  >
                    {row.invoiceFolio && row.invoiceFolio !== row.folioLabel
                      ? row.invoiceFolio
                      : row.folioLabel}
                  </Link>
                  {row.invoiceFolio && row.invoiceFolio !== row.folioLabel && (
                    <p className="mt-0.5 text-xs text-neutral-400">{row.folioLabel}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.dateLabel}</td>
                <td className="px-4 py-3 text-neutral-500">{row.supplierName ?? "-"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{row.lineCount}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoney(row.total)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => eliminar(row)}
                    disabled={pending}
                    className="text-sm text-neutral-400 transition-colors hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingFolio === row.folio ? "Eliminando..." : "Eliminar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
