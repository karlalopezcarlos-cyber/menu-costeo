"use client";

import { Fragment, useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchableSelect from "../../_components/SearchableSelect";
import { addFolioPayment, settleFolios, resetFolios, deleteAdvancePayment } from "./actions";

export type FolioRow = {
  folio: number;
  folioLabel: string;
  dateLabel: string;
  dateValue: number;
  total: number;
  abonado: number;
  isPaid: boolean;
  paidDateLabel: string | null;
};

export type LegacyAdvanceRow = {
  id: string;
  amount: number;
  paidDateLabel: string;
  note: string | null;
};

export type OrphanedFolioRow = {
  folio: number;
  folioLabel: string;
  amount: number;
  paidDateLabel: string | null;
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const abonoInitialState: { error?: string } = {};

function AbonoForm({
  supplierId,
  folio,
  remaining,
  onDone,
}: {
  supplierId: string;
  folio: number;
  remaining: number;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(addFolioPayment, abonoInitialState);

  useEffect(() => {
    if (state === abonoInitialState) return;
    if (!state.error) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <tr className="border-t border-neutral-100 bg-neutral-50">
      <td colSpan={8} className="px-4 py-3">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="supplierId" value={supplierId} />
          <input type="hidden" name="folio" value={folio} />
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-500">Monto del abono</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                $
              </span>
              <input
                name="amount"
                type="number"
                step="any"
                min="0"
                max={remaining}
                required
                defaultValue={remaining.toFixed(2)}
                className="w-28 rounded-md border border-neutral-300 py-2 pl-5 pr-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-500">Fecha</label>
            <input
              name="paidDate"
              type="date"
              required
              defaultValue={todayInputValue()}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-neutral-500">Saldo pendiente de este folio: {money(remaining)}</p>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar abono"}
          </button>
          <button type="button" onClick={onDone} className="text-sm text-neutral-500 hover:underline">
            Cancelar
          </button>
          {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}

function FolioPaymentRow({
  supplierId,
  row,
  checked,
  onToggleChecked,
}: {
  supplierId: string;
  row: FolioRow;
  checked: boolean;
  onToggleChecked: (checked: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showAbonoForm, setShowAbonoForm] = useState(false);
  const remaining = Math.max(row.total - row.abonado, 0);

  function togglePagado(checked: boolean) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("supplierId", supplierId);
      formData.set("folios", String(row.folio));
      if (checked) {
        formData.set("paidDate", todayInputValue());
        await settleFolios(formData);
      } else {
        await resetFolios(formData);
      }
    });
  }

  return (
    <Fragment>
      <tr className="border-t border-neutral-100">
        <td className="px-4 py-2 text-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleChecked(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
        </td>
        <td className="px-4 py-2 text-neutral-500">{row.folioLabel}</td>
        <td className="px-4 py-2 text-neutral-500">{row.dateLabel}</td>
        <td className="px-4 py-2 text-right">{money(row.total)}</td>
        <td className="px-4 py-2 text-right text-neutral-500">
          {row.abonado > 0 ? `${money(row.abonado)} de ${money(row.total)}` : "-"}
        </td>
        <td className="px-4 py-2 text-neutral-500">{row.paidDateLabel ?? "-"}</td>
        <td className="px-4 py-2 text-center">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={row.isPaid}
              disabled={pending}
              onChange={(e) => togglePagado(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="text-xs text-neutral-500">Pagado</span>
          </label>
        </td>
        <td className="px-4 py-2 text-center">
          {!row.isPaid && (
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showAbonoForm}
                onChange={(e) => setShowAbonoForm(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-xs text-neutral-500">Abonar</span>
            </label>
          )}
        </td>
      </tr>
      {showAbonoForm && (
        <AbonoForm
          supplierId={supplierId}
          folio={row.folio}
          remaining={remaining}
          onDone={() => setShowAbonoForm(false)}
        />
      )}
    </Fragment>
  );
}

export default function SupplierPaymentsManager({
  supplier,
  allSuppliers,
  folioRows,
  orphanedFolioRows,
  legacyAdvanceRows,
  totalPurchased,
  totalPaid,
  balance,
}: {
  supplier: { id: string; name: string };
  allSuppliers: { id: string; name: string }[];
  folioRows: FolioRow[];
  orphanedFolioRows: OrphanedFolioRow[];
  legacyAdvanceRows: LegacyAdvanceRow[];
  totalPurchased: number;
  totalPaid: number;
  balance: number;
}) {
  const router = useRouter();
  const [folioSearch, setFolioSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();

  const fromValue = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).getTime() : null;
  const toValue = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).getTime() : null;
  const folioQuery = folioSearch.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return folioRows.filter((row) => {
      if (fromValue !== null && row.dateValue < fromValue) return false;
      if (toValue !== null && row.dateValue > toValue) return false;
      if (folioQuery && !row.folioLabel.toLowerCase().includes(folioQuery) && !String(row.folio).includes(folioQuery)) {
        return false;
      }
      if (onlyUnpaid && row.isPaid) return false;
      return true;
    });
  }, [folioRows, fromValue, toValue, folioQuery, onlyUnpaid]);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selected.has(row.folio));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRows.map((row) => row.folio)));
    }
  }

  function toggleRow(folio: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(folio);
      else next.delete(folio);
      return next;
    });
  }

  const selectedRows = folioRows.filter((row) => selected.has(row.folio));

  function bulkPay() {
    const folios = selectedRows.map((row) => row.folio);
    if (folios.length === 0) return;
    startBulkTransition(async () => {
      const formData = new FormData();
      formData.set("supplierId", supplier.id);
      formData.set("folios", folios.join(","));
      formData.set("paidDate", todayInputValue());
      await settleFolios(formData);
      setSelected(new Set());
    });
  }

  function bulkUnpay() {
    const folios = selectedRows.map((row) => row.folio);
    if (folios.length === 0) return;
    startBulkTransition(async () => {
      const formData = new FormData();
      formData.set("supplierId", supplier.id);
      formData.set("folios", folios.join(","));
      await resetFolios(formData);
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="max-w-sm flex-1">
          <label className="text-xs font-medium text-neutral-500">Proveedor</label>
          <SearchableSelect
            name="supplierId"
            options={allSuppliers.map((s) => ({ id: s.id, label: s.name }))}
            value={supplier.id}
            onChange={(id) => {
              if (id) router.push(`/payments/${id}`);
            }}
            placeholder="Buscar proveedor..."
          />
        </div>
        <a href="/payments" className="text-sm text-neutral-500 hover:underline">
          ← Todos los proveedores
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total comprado</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{money(totalPurchased)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Total pagado</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{money(totalPaid)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-medium text-neutral-500">Saldo al proveedor</p>
          <p className={`mt-1 text-xl font-semibold ${balance > 0.005 ? "text-red-600" : "text-green-700"}`}>
            {money(balance)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Folios de {supplier.name}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="text"
            value={folioSearch}
            onChange={(e) => setFolioSearch(e.target.value)}
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
              onChange={(e) => setDateFrom(e.target.value)}
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
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="text-sm text-neutral-500 hover:underline"
            >
              Limpiar fechas
            </button>
          )}
          <label className="flex items-center gap-1.5 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Solo pendientes de pago
          </label>
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={filteredRows.length === 0}
            className="ml-auto rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {allFilteredSelected ? "Deseleccionar todo" : "Seleccionar todo"}
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm">
            <span className="text-neutral-600">{selected.size} folio(s) seleccionado(s)</span>
            <button
              type="button"
              onClick={bulkPay}
              disabled={bulkPending}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Pagar todo lo seleccionado
            </button>
            <button
              type="button"
              onClick={bulkUnpay}
              disabled={bulkPending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              Quitar pago de seleccionados
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium"></th>
                <th className="px-4 py-2 font-medium">Folio</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
                <th className="px-4 py-2 font-medium text-right">Abonado</th>
                <th className="px-4 py-2 font-medium">Fecha de pago</th>
                <th className="px-4 py-2 font-medium text-center">Pagado</th>
                <th className="px-4 py-2 font-medium text-center">Abonar</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                    {folioRows.length === 0
                      ? "Este proveedor todavia no tiene compras registradas."
                      : "Ningun folio coincide con los filtros."}
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <FolioPaymentRow
                  key={row.folio}
                  supplierId={supplier.id}
                  row={row}
                  checked={selected.has(row.folio)}
                  onToggleChecked={(checked) => toggleRow(row.folio, checked)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {orphanedFolioRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">⚠️ Pagos sin compra asociada</h2>
          <p className="text-sm text-neutral-500">
            Estos folios tienen un pago registrado, pero la compra correspondiente ya no existe (se
            elimino despues de haberse pagado). Esto desajusta el saldo del proveedor -- quita el
            pago para corregirlo, o vuelve a capturar la compra si el pago si es valido.
          </p>
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
            <table className="w-full text-sm">
              <thead className="bg-amber-100/60 text-left text-amber-800">
                <tr>
                  <th className="px-4 py-2 font-medium">Folio</th>
                  <th className="px-4 py-2 font-medium text-right">Pagado</th>
                  <th className="px-4 py-2 font-medium">Fecha de pago</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orphanedFolioRows.map((row) => (
                  <tr key={row.folio} className="border-t border-amber-200">
                    <td className="px-4 py-2 text-amber-900">{row.folioLabel}</td>
                    <td className="px-4 py-2 text-right text-amber-900">{money(row.amount)}</td>
                    <td className="px-4 py-2 text-amber-900">{row.paidDateLabel ?? "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={resetFolios}>
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <input type="hidden" name="folios" value={row.folio} />
                        <button type="submit" className="text-sm text-red-600 hover:underline">
                          Quitar pago
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {legacyAdvanceRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-900">Abonos sin folio (registrados antes)</h2>
          <p className="text-sm text-neutral-500">
            Estos abonos ya no se pueden crear desde aqui; todo abono nuevo se liga a un folio.
          </p>
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium text-right">Monto</th>
                  <th className="px-4 py-2 font-medium">Nota</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {legacyAdvanceRows.map((adv) => (
                  <tr key={adv.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2 text-neutral-500">{adv.paidDateLabel}</td>
                    <td className="px-4 py-2 text-right">{money(adv.amount)}</td>
                    <td className="px-4 py-2 text-neutral-500">{adv.note ?? "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <form action={deleteAdvancePayment}>
                        <input type="hidden" name="id" value={adv.id} />
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <button type="submit" className="text-sm text-red-600 hover:underline">
                          Eliminar
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
