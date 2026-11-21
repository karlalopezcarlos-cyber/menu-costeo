"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { deleteRequisicion } from "./actions";

export type Opcion = { id: string; name: string };

export type RequisicionRow = {
  id: string;
  folio: number;
  folioLabel: string;
  /** Dia de la operacion en formato yyyy-mm-dd, para comparar con los filtros Desde/Hasta. */
  fechaISO: string;
  fechaLabel: string;
  horaLabel: string;
  creadaEn: number;
  fromSucursalId: string;
  fromSucursalName: string;
  toSucursalId: string;
  toSucursalName: string;
  direction: "enviada" | "recibida" | "ajena";
  usuario: string;
  itemCount: number;
  total: number;
  note: string | null;
  puedeBorrar: boolean;
};

const DIRECTION_STYLE: Record<RequisicionRow["direction"], string> = {
  enviada: "bg-amber-100 text-amber-700",
  recibida: "bg-emerald-100 text-emerald-700",
  ajena: "bg-neutral-100 text-neutral-500",
};

const DIRECTION_LABEL: Record<RequisicionRow["direction"], string> = {
  enviada: "Enviada",
  recibida: "Recibida",
  ajena: "Otra sucursal",
};

/** Columnas por las que se puede ordenar. El valor que devuelve `valorDe` es el que se compara. */
type Campo =
  | "folio"
  | "fecha"
  | "origen"
  | "destino"
  | "direccion"
  | "usuario"
  | "items"
  | "total"
  | "nota";

function valorDe(row: RequisicionRow, campo: Campo): string | number {
  switch (campo) {
    case "folio":
      return row.folio;
    // La fecha ordena por el dia y, dentro del mismo dia, por la hora en que se registro.
    case "fecha":
      return `${row.fechaISO} ${String(row.creadaEn).padStart(16, "0")}`;
    case "origen":
      return row.fromSucursalName;
    case "destino":
      return row.toSucursalName;
    case "direccion":
      return DIRECTION_LABEL[row.direction];
    case "usuario":
      return row.usuario;
    case "items":
      return row.itemCount;
    case "total":
      return row.total;
    case "nota":
      return row.note ?? "";
  }
}

export default function RequisicionesTable({
  rows,
  sucursales,
  usuarios,
}: {
  rows: RequisicionRow[];
  sucursales: Opcion[];
  usuarios: Opcion[];
}) {
  const router = useRouter();
  const [borrando, startBorrado] = useTransition();
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const [folioSearch, setFolioSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | RequisicionRow["direction"]>("all");
  const [usuarioFilter, setUsuarioFilter] = useState("all");
  const [sucursalFilter, setSucursalFilter] = useState("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [orden, setOrden] = useState<{ campo: Campo; asc: boolean }>({ campo: "folio", asc: false });

  const hayFiltros =
    folioSearch !== "" ||
    directionFilter !== "all" ||
    usuarioFilter !== "all" ||
    sucursalFilter !== "all" ||
    desde !== "" ||
    hasta !== "";

  function limpiar() {
    setFolioSearch("");
    setDirectionFilter("all");
    setUsuarioFilter("all");
    setSucursalFilter("all");
    setDesde("");
    setHasta("");
  }

  function ordenarPor(campo: Campo) {
    setOrden((previo) =>
      previo.campo === campo
        ? { campo, asc: !previo.asc }
        : // Los numeros arrancan de mayor a menor (el folio nuevo y el costo mas alto primero);
          // el texto, alfabetico.
          { campo, asc: !["folio", "fecha", "items", "total"].includes(campo) },
    );
  }

  const filteredRows = useMemo(() => {
    const q = folioSearch.trim().toLowerCase();
    const filtradas = rows.filter((row) => {
      if (q && !row.folioLabel.toLowerCase().includes(q)) return false;
      if (directionFilter !== "all" && row.direction !== directionFilter) return false;
      if (usuarioFilter !== "all" && row.usuario !== usuarioFilter) return false;
      if (
        sucursalFilter !== "all" &&
        row.fromSucursalId !== sucursalFilter &&
        row.toSucursalId !== sucursalFilter
      ) {
        return false;
      }
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
  }, [rows, folioSearch, directionFilter, usuarioFilter, sucursalFilter, desde, hasta, orden]);

  const totalVisible = filteredRows.reduce((sum, row) => sum + row.total, 0);

  function borrar(row: RequisicionRow) {
    const aviso =
      `Borrar la requisicion ${row.folioLabel}?\n\n` +
      `Se va a deshacer el movimiento de inventario entre ${row.fromSucursalName} y ` +
      `${row.toSucursalName} (${row.itemCount} renglon${row.itemCount === 1 ? "" : "es"}, ` +
      `${formatMoney(row.total)}).\n\nEsto no se puede deshacer.`;
    if (!window.confirm(aviso)) return;

    setErrorBorrado(null);
    startBorrado(async () => {
      const resultado = await deleteRequisicion(row.id);
      if (resultado?.error) setErrorBorrado(resultado.error);
      else router.refresh();
    });
  }

  /** Titulo de columna que ordena al hacerle click. */
  function Th({
    campo,
    children,
    alinearDerecha,
  }: {
    campo: Campo;
    children: React.ReactNode;
    alinearDerecha?: boolean;
  }) {
    const activa = orden.campo === campo;
    return (
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
        <button
          type="button"
          onClick={() => ordenarPor(campo)}
          aria-sort={activa ? (orden.asc ? "ascending" : "descending") : "none"}
          className={`flex w-full items-center gap-1 uppercase transition-colors hover:text-neutral-800 ${
            alinearDerecha ? "justify-end" : ""
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Folio
          </label>
          <input
            type="text"
            value={folioSearch}
            onChange={(e) => setFolioSearch(e.target.value)}
            placeholder="REQ-0001"
            className="w-[9rem] rounded-md border border-neutral-200 px-3 py-2 text-sm"
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
            Sucursal
          </label>
          <select
            value={sucursalFilter}
            onChange={(e) => setSucursalFilter(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Usuario
          </label>
          <select
            value={usuarioFilter}
            onChange={(e) => setUsuarioFilter(e.target.value)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Direccion
          </label>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
            className="rounded-md border border-neutral-200 px-3 py-2 text-sm"
          >
            <option value="all">Enviadas y recibidas</option>
            <option value="enviada">Solo enviadas</option>
            <option value="recibida">Solo recibidas</option>
            <option value="ajena">De otras sucursales</option>
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
          {filteredRows.length} de {rows.length} · {formatMoney(totalVisible)}
        </p>
      </div>

      {errorBorrado && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorBorrado}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <Th campo="folio">Folio</Th>
              <Th campo="fecha">Fecha y hora</Th>
              <Th campo="origen">Origen</Th>
              <Th campo="destino">Destino</Th>
              <Th campo="direccion">Direccion</Th>
              <Th campo="usuario">Registro</Th>
              <Th campo="items" alinearDerecha>
                Productos
              </Th>
              <Th campo="total" alinearDerecha>
                Costo total
              </Th>
              <Th campo="nota">Nota</Th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "Todavia no hay requisiciones registradas."
                    : "Ninguna requisicion coincide con los filtros."}
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-neutral-100 transition-colors hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/requisitions/${row.id}`} className="text-neutral-700 hover:underline">
                    {row.folioLabel}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                  {row.fechaLabel} <span className="text-neutral-400">{row.horaLabel}</span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.fromSucursalName}</td>
                <td className="px-4 py-3 text-neutral-500">{row.toSucursalName}</td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${DIRECTION_STYLE[row.direction]}`}
                  >
                    {DIRECTION_LABEL[row.direction]}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-500">{row.usuario}</td>
                <td className="px-4 py-3 text-right text-neutral-500">{row.itemCount}</td>
                <td className="px-4 py-3 text-right">{formatMoney(row.total)}</td>
                <td className="max-w-[14rem] truncate px-4 py-3 text-neutral-500" title={row.note ?? ""}>
                  {row.note ?? ""}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.puedeBorrar && (
                    <button
                      type="button"
                      onClick={() => borrar(row)}
                      disabled={borrando}
                      title={`Borrar ${row.folioLabel}`}
                      className="rounded-md px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    >
                      Borrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
