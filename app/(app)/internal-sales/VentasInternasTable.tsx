"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

export type VentaInternaRow = {
  id: string;
  requisicionId: string;
  folioLabel: string;
  fechaISO: string;
  fechaLabel: string;
  destinoId: string;
  destinoName: string;
  usuario: string;
  concepto: string;
  esSubreceta: boolean;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  costoTotal: number;
  ventaTotal: number;
  ingreso: number;
};

type Opcion = { id: string; name: string };

type Campo =
  | "fecha"
  | "folio"
  | "destino"
  | "concepto"
  | "usuario"
  | "cantidad"
  | "costo"
  | "venta"
  | "ingreso";

function valorDe(row: VentaInternaRow, campo: Campo): string | number {
  switch (campo) {
    case "fecha":
      return row.fechaISO;
    case "folio":
      return row.folioLabel;
    case "destino":
      return row.destinoName;
    case "concepto":
      return row.concepto;
    case "usuario":
      return row.usuario;
    case "cantidad":
      return row.cantidad;
    case "costo":
      return row.costoTotal;
    case "venta":
      return row.ventaTotal;
    case "ingreso":
      return row.ingreso;
  }
}

export default function VentasInternasTable({
  rows,
  destinos,
  usuarios,
}: {
  rows: VentaInternaRow[];
  destinos: Opcion[];
  usuarios: Opcion[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [destino, setDestino] = useState("all");
  const [usuario, setUsuario] = useState("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<{ campo: Campo; asc: boolean }>({ campo: "fecha", asc: false });

  const hayFiltros =
    busqueda !== "" || destino !== "all" || usuario !== "all" || desde !== "" || hasta !== "";

  function limpiar() {
    setBusqueda("");
    setDestino("all");
    setUsuario("all");
    setDesde("");
    setHasta("");
  }

  function ordenarPor(campo: Campo) {
    setOrden((previo) =>
      previo.campo === campo
        ? { campo, asc: !previo.asc }
        : { campo, asc: !["fecha", "cantidad", "costo", "venta", "ingreso"].includes(campo) },
    );
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = rows.filter((row) => {
      if (q && !row.concepto.toLowerCase().includes(q) && !row.folioLabel.toLowerCase().includes(q)) {
        return false;
      }
      if (destino !== "all" && row.destinoId !== destino) return false;
      if (usuario !== "all" && row.usuario !== usuario) return false;
      if (desde && row.fechaISO < desde) return false;
      if (hasta && row.fechaISO > hasta) return false;
      return true;
    });

    return filtradas.sort((a, b) => {
      const va = valorDe(a, orden.campo);
      const vb = valorDe(b, orden.campo);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      return orden.asc ? cmp : -cmp;
    });
  }, [rows, busqueda, destino, usuario, desde, hasta, orden]);

  const totalVenta = visibles.reduce((s, r) => s + r.ventaTotal, 0);
  const totalCosto = visibles.reduce((s, r) => s + r.costoTotal, 0);
  const totalIngreso = visibles.reduce((s, r) => s + r.ingreso, 0);
  const margenPct = totalVenta === 0 ? 0 : (totalIngreso / totalVenta) * 100;

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
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
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
            {activa && !orden.asc ? "▼" : "▲"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Traspasado</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{formatMoney(totalVenta)}</p>
          <p className="mt-0.5 text-xs text-neutral-400">a precio de venta interna</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Costo</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{formatMoney(totalCosto)}</p>
          <p className="mt-0.5 text-xs text-neutral-400">lo que costaba en esta sucursal</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Ingreso</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900">{formatMoney(totalIngreso)}</p>
          <p className="mt-0.5 text-xs text-neutral-400">{margenPct.toFixed(1)}% del traspaso</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Buscar
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Producto o folio"
            className="w-[12rem] rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Sucursal destino
          </label>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Usuario
          </label>
          <select
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        {hayFiltros && (
          <button
            type="button"
            onClick={limpiar}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            Limpiar
          </button>
        )}
        <p className="ml-auto self-center text-sm text-neutral-500">
          {visibles.length} de {rows.length} renglones
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <Th campo="fecha">Fecha</Th>
              <Th campo="folio">Folio</Th>
              <Th campo="destino">Destino</Th>
              <Th campo="concepto">Producto / Subreceta</Th>
              <Th campo="cantidad" derecha>
                Cantidad
              </Th>
              <Th campo="costo" derecha>
                Costo
              </Th>
              <Th campo="venta" derecha>
                Venta interna
              </Th>
              <Th campo="ingreso" derecha>
                Ingreso
              </Th>
              <Th campo="usuario">Registro</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                  Ningun renglon coincide con los filtros.
                </td>
              </tr>
            )}
            {visibles.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-3 text-neutral-500">{row.fechaLabel}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/requisitions/${row.requisicionId}`}
                    className="text-neutral-700 hover:underline"
                  >
                    {row.folioLabel}
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.destinoName}</td>
                <td className="px-4 py-3">
                  {row.concepto}
                  {row.esSubreceta && (
                    <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      Subreceta
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-neutral-500">
                  {row.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 4 })} {row.unidad}
                </td>
                <td className="px-4 py-3 text-right text-neutral-500">{formatMoney(row.costoTotal)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.ventaTotal)}</td>
                <td
                  className={`px-4 py-3 text-right font-medium ${
                    row.ingreso < 0 ? "text-red-600" : "text-neutral-900"
                  }`}
                >
                  {formatMoney(row.ingreso)}
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.usuario}</td>
              </tr>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot className="border-t border-neutral-200 bg-neutral-50 font-medium">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right text-neutral-500">
                  Total
                </td>
                <td className="px-4 py-3 text-right text-neutral-600">{formatMoney(totalCosto)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(totalVenta)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(totalIngreso)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
