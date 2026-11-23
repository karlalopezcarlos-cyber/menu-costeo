"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  KARDEX_TYPE_LABELS,
  type KardexFilters,
  type KardexRow,
  type KardexTotals,
} from "@/lib/kardex-types";

const TYPE_STYLES: Record<string, string> = {
  compra: "bg-emerald-100 text-emerald-700",
  requisicion_entrada: "bg-teal-100 text-teal-700",
  transformacion_entrada: "bg-indigo-100 text-indigo-700",
  transformacion_salida: "bg-indigo-100 text-indigo-700",
  produccion_salida: "bg-amber-100 text-amber-700",
  venta: "bg-blue-100 text-blue-700",
  merma: "bg-red-100 text-red-700",
  servicio: "bg-orange-100 text-orange-700",
  pruebas: "bg-orange-100 text-orange-700",
  requisicion_salida: "bg-orange-100 text-orange-700",
};

function qty(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

type Campo =
  | "fecha"
  | "hora"
  | "producto"
  | "movimiento"
  | "folio"
  | "detalle"
  | "entrada"
  | "salida"
  | "saldo"
  | "usuario";

function valorDe(
  { row, balance }: { row: KardexRow; balance: number },
  campo: Campo,
): string | number {
  switch (campo) {
    case "fecha":
      return row.dateValue;
    case "hora":
      return row.createdAtValue;
    case "producto":
      return row.articuloNombre;
    case "movimiento":
      return row.typeLabel;
    case "folio":
      return row.reference;
    case "detalle":
      return row.detail;
    case "entrada":
      return Math.max(row.qtyDelta, 0);
    case "salida":
      return Math.max(-row.qtyDelta, 0);
    case "saldo":
      return balance;
    case "usuario":
      return row.userName ?? "";
  }
}

export default function KardexTable({
  rows,
  totals,
  filters,
  products,
  subrecetas,
  users,
  opening,
  productName,
  isDefaultMonth,
  defaultFrom,
  defaultTo,
  truncated,
}: {
  rows: KardexRow[];
  totals: KardexTotals;
  filters: KardexFilters;
  products: { id: string; name: string }[];
  subrecetas: { id: string; name: string }[];
  users: string[];
  opening: { qty: number; basisLabel: string } | null;
  productName: string | null;
  isDefaultMonth: boolean;
  defaultFrom: string;
  defaultTo: string;
  truncated: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [folioInput, setFolioInput] = useState(filters.folio);
  const [articuloId, setArticuloId] = useState(filters.articuloId);
  const [userFilter, setUserFilter] = useState(filters.user);
  const [typeFilter, setTypeFilter] = useState(filters.type);
  const [dateFrom, setDateFrom] = useState(isDefaultMonth ? defaultFrom : filters.dateFrom);
  const [dateTo, setDateTo] = useState(isDefaultMonth ? defaultTo : filters.dateTo);
  // El orden es nada mas de pantalla: no viaja a la URL ni vuelve a consultar.
  const [orden, setOrden] = useState<{ campo: Campo; asc: boolean }>({ campo: "fecha", asc: true });

  function buildParams(next: Partial<KardexFilters>): URLSearchParams {
    const merged: KardexFilters = {
      articuloId: next.articuloId ?? articuloId,
      search: next.search ?? searchInput,
      folio: next.folio ?? folioInput,
      user: next.user ?? userFilter,
      type: next.type ?? typeFilter,
      dateFrom: next.dateFrom ?? dateFrom,
      dateTo: next.dateTo ?? dateTo,
    };
    const params = new URLSearchParams();
    if (merged.articuloId) params.set("articulo", merged.articuloId);
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.folio.trim()) params.set("folio", merged.folio.trim());
    if (merged.user) params.set("user", merged.user);
    if (merged.type) params.set("type", merged.type);
    if (merged.dateFrom) params.set("from", merged.dateFrom);
    if (merged.dateTo) params.set("to", merged.dateTo);
    return params;
  }

  function navigate(next: Partial<KardexFilters>) {
    const params = buildParams(next);
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
    const timeout = setTimeout(() => navigate({ folio: folioInput }), 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folioInput]);

  const exportHref = `/api/export/kardex?${buildParams({}).toString()}`;

  // El saldo corrido solo se arma con un producto a la vez: mezclar kilos de atun con piezas de
  // camaron en una sola columna no significaria nada.
  const conSaldo = opening !== null;
  const rowsConSaldo = useMemo(() => {
    const acumulado: { row: KardexRow; balance: number }[] = [];
    let balance = opening?.qty ?? 0;
    for (const row of rows) {
      balance += row.qtyDelta;
      acumulado.push({ row, balance });
    }
    return acumulado;
  }, [rows, opening]);

  // El saldo corrido se calcula SIEMPRE en orden cronologico y queda pegado a su movimiento: es
  // "con cuanto quedo despues de este", y eso no cambia porque la tabla se vea de otra forma.
  // Por eso se ordena hasta aqui, despues de acumular.
  const visibles = useMemo(() => {
    const copia = [...rowsConSaldo];
    copia.sort((a, b) => {
      const va = valorDe(a, orden.campo);
      const vb = valorDe(b, orden.campo);
      let cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      // Dos movimientos del mismo dia se desempatan por hora de captura, que es el orden real.
      if (cmp === 0) cmp = a.row.createdAtValue - b.row.createdAtValue;
      return orden.asc ? cmp : -cmp;
    });
    return copia;
  }, [rowsConSaldo, orden]);

  // El renglon del saldo inicial solo tiene sentido pegado al extremo cronologico. Con otro
  // orden se esconde: el dato ya esta en el recuadro de arriba.
  const cronologico = orden.campo === "fecha" || orden.campo === "hora";
  const inicialArriba = conSaldo && cronologico && orden.asc;
  const inicialAbajo = conSaldo && cronologico && !orden.asc;

  function ordenarPor(campo: Campo) {
    setOrden((previo) =>
      previo.campo === campo
        ? { campo, asc: !previo.asc }
        : { campo, asc: campo === "producto" || campo === "folio" || campo === "detalle" || campo === "movimiento" || campo === "usuario" },
    );
  }

  /** Titulo que ordena al hacerle click y que se queda pegado arriba al bajar la tabla. */
  function Th({
    campo,
    children,
    derecha,
  }: {
    campo: Campo;
    children: React.ReactNode;
    derecha?: boolean;
  }) {
    const activa = orden.campo === campo;
    return (
      <th className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
        <button
          type="button"
          onClick={() => ordenarPor(campo)}
          aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}
          className={`flex w-full items-center gap-1 uppercase transition-colors hover:text-neutral-800 ${
            derecha ? "justify-end" : ""
          } ${activa ? "text-neutral-800" : ""}`}
        >
          {children}
          <span className={activa ? "text-brand-600" : "text-transparent"}>
            {activa && !orden.asc ? "\u25bc" : "\u25b2"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {truncated && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Se muestran los primeros 2,000 movimientos del periodo. Elige un producto o acorta las
          fechas para ver el resto.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="kardexProduct" className="text-xs font-medium text-neutral-500">
            Articulo
          </label>
          <select
            id="kardexProduct"
            value={articuloId}
            onChange={(e) => {
              setArticuloId(e.target.value);
              navigate({ articuloId: e.target.value });
            }}
            className="w-64 rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Todo</option>
            <optgroup label="Productos">
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </optgroup>
            {subrecetas.length > 0 && (
              <optgroup label="Subrecetas">
                {subrecetas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar producto, detalle o usuario..."
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
          <label htmlFor="kardexFrom" className="text-xs font-medium text-neutral-500">
            Desde
          </label>
          <input
            id="kardexFrom"
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
          <label htmlFor="kardexTo" className="text-xs font-medium text-neutral-500">
            Hasta
          </label>
          <input
            id="kardexTo"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              navigate({ dateTo: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="kardexType" className="text-xs font-medium text-neutral-500">
            Movimiento
          </label>
          <select
            id="kardexType"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              navigate({ type: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Todos los movimientos</option>
            {Object.entries(KARDEX_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="kardexUser" className="text-xs font-medium text-neutral-500">
            Usuario
          </label>
          <select
            id="kardexUser"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              navigate({ user: e.target.value });
            }}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="">Todos los usuarios</option>
            {users.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <a
          href={exportHref}
          className="ml-auto rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-700 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
          Exportar a Excel
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Movimientos
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">{rows.length}</p>
          <p className="mt-1 text-xs text-neutral-500">En el periodo filtrado</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Saldo inicial
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">
            {conSaldo ? qty(opening!.qty) : "-"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {conSaldo ? opening!.basisLabel : "Elige un producto para ver su saldo"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Entradas
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
            {qty(totals.entradas)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {conSaldo ? "En la unidad del producto" : "Sumando todas las unidades"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            {conSaldo ? "Salidas y saldo final" : "Salidas"}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600">
            {qty(totals.salidas)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {conSaldo
              ? `Saldo final teorico: ${qty(opening!.qty + totals.entradas - totals.salidas)}`
              : "Sumando todas las unidades"}
          </p>
        </div>
      </div>

      {totals.porTipo.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.porTipo.map((item) => (
            <span
              key={item.type}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_STYLES[item.type] ?? "bg-neutral-100 text-neutral-600"}`}
            >
              {item.label}: {qty(item.qty)}
            </span>
          ))}
        </div>
      )}

      {/* El scroll vive en este contenedor y no en la ventana: es lo que deja que los titulos se
          queden pegados arriba mientras la lista corre debajo. */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <Th campo="fecha">Fecha</Th>
              <Th campo="hora">Hora</Th>
              {!conSaldo && <Th campo="producto">Producto</Th>}
              <Th campo="movimiento">Movimiento</Th>
              <Th campo="folio">Folio</Th>
              <Th campo="detalle">Detalle</Th>
              <Th campo="entrada" derecha>
                Entrada
              </Th>
              <Th campo="salida" derecha>
                Salida
              </Th>
              {conSaldo && (
                <Th campo="saldo" derecha>
                  Saldo
                </Th>
              )}
              <Th campo="usuario">Usuario</Th>
            </tr>
          </thead>
          <tbody>
            {inicialArriba && <RenglonInicial />}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-neutral-400">
                  No hay movimientos con estos filtros.
                </td>
              </tr>
            )}
            {visibles.map(({ row, balance }) => {
              return (
                <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                  <td className="px-3 py-2 text-neutral-500">{row.dateLabel}</td>
                  <td className="px-3 py-2 text-neutral-400">{row.timeLabel}</td>
                  {!conSaldo && (
                    <td className="px-3 py-2 font-medium text-neutral-900">
                      {row.articuloNombre}
                      {row.articuloTipo === "subreceta" && (
                        <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                          subreceta
                        </span>
                      )}
                      <span className="ml-1 text-xs text-neutral-400">{row.unitLabel}</span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[row.type] ?? "bg-neutral-100 text-neutral-600"}`}
                    >
                      {row.typeLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {row.reference && row.href ? (
                      <Link href={row.href} className="hover:underline">
                        {row.reference}
                      </Link>
                    ) : (
                      row.reference || "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{row.detail || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {row.qtyDelta > 0 ? qty(row.qtyDelta) : ""}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">
                    {row.qtyDelta < 0 ? qty(-row.qtyDelta) : ""}
                  </td>
                  {conSaldo && (
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{qty(balance)}</td>
                  )}
                  <td className="px-3 py-2 text-neutral-500">{row.userName ?? "-"}</td>
                </tr>
              );
            })}
            {inicialAbajo && <RenglonInicial />}
          </tbody>
        </table>
      </div>
    </div>
  );

  function RenglonInicial() {
    return (
      <tr className="border-t border-neutral-100 bg-neutral-50 font-medium">
        <td className="px-3 py-2 text-neutral-500" colSpan={5}>
          Saldo inicial de {productName} · {opening!.basisLabel}
        </td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2" />
        <td className="px-3 py-2 text-right tabular-nums">{qty(opening!.qty)}</td>
        <td className="px-3 py-2" />
      </tr>
    );
  }
}
