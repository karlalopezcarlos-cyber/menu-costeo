"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { CorteRow } from "@/lib/kardex-types";

type Campo = "articulo" | "tipo" | "base" | "movimientos" | "saldo" | "costo" | "valor";

function valorDe(row: CorteRow, campo: Campo): string | number {
  switch (campo) {
    case "articulo":
      return row.articuloNombre;
    case "tipo":
      return row.articuloTipo;
    case "base":
      return row.base;
    case "movimientos":
      return row.movimientos;
    case "saldo":
      return row.saldo;
    case "costo":
      return row.unitCost;
    case "valor":
      return row.valor;
  }
}

function cantidad(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 4 });
}

export default function InventarioAlCorteTable({
  rows,
  basisLabel,
  sinConteo,
  fecha,
}: {
  rows: CorteRow[];
  basisLabel: string;
  sinConteo: boolean;
  fecha: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [soloConSaldo, setSoloConSaldo] = useState(true);
  const [orden, setOrden] = useState<{ campo: Campo; asc: boolean }>({ campo: "valor", asc: false });

  function ordenarPor(campo: Campo) {
    setOrden((previo) =>
      previo.campo === campo ? { campo, asc: !previo.asc } : { campo, asc: campo === "articulo" || campo === "tipo" },
    );
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = rows.filter((row) => {
      if (q && !row.articuloNombre.toLowerCase().includes(q)) return false;
      if (soloConSaldo && row.saldo === 0) return false;
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
  }, [rows, busqueda, soloConSaldo, orden]);

  const totalValor = visibles.reduce((s, r) => s + r.valor, 0);
  const enNegativo = visibles.filter((r) => r.saldo < 0).length;

  /** Titulo que ordena al hacerle click. Se queda pegado arriba al bajar la tabla. */
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Valor del inventario
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">
            {formatMoney(totalValor)}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Al {fecha}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            Articulos
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">
            {visibles.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">con movimiento o saldo</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
            En negativo
          </p>
          <p
            className={`mt-2 text-2xl font-semibold tabular-nums ${
              enNegativo > 0 ? "text-red-600" : "text-neutral-900"
            }`}
          >
            {enNegativo}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {enNegativo > 0 ? "salio mas de lo que entro" : "ninguno"}
          </p>
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 text-sm ${
          sinConteo
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-neutral-200 bg-white text-neutral-600"
        }`}
      >
        <p>
          <span className="font-medium">Parte de: {basisLabel}.</span> Esto es lo que el sistema
          cree que hay, no lo que hay. Comparado contra un conteo fisico, la diferencia es
          justamente lo que se fue sin registrarse.
        </p>
        {enNegativo > 0 && (
          <p className="mt-1">
            Hay {enNegativo} {enNegativo === 1 ? "articulo" : "articulos"} en negativo: se
            descargo mas de lo que entro, casi siempre porque falta capturar una compra o porque
            la receta descuenta de mas.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar articulo..."
          className="w-[16rem] rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={soloConSaldo}
            onChange={(e) => setSoloConSaldo(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Esconder los que quedan en cero
        </label>
        <p className="ml-auto text-sm text-neutral-500">
          {visibles.length} de {rows.length} articulos
        </p>
      </div>

      {/* El scroll vive aqui y no en la ventana: es lo que permite que los titulos se queden
          pegados arriba mientras la lista corre debajo. */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <Th campo="articulo">Articulo</Th>
              <Th campo="tipo">Tipo</Th>
              <th className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                Unidad
              </th>
              <Th campo="base" derecha>
                Ultimo conteo
              </Th>
              <Th campo="movimientos" derecha>
                Movimientos
              </Th>
              <Th campo="saldo" derecha>
                Saldo
              </Th>
              <Th campo="costo" derecha>
                Costo unitario
              </Th>
              <Th campo="valor" derecha>
                Valor
              </Th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  {rows.length === 0
                    ? "No hay movimientos ni conteos hasta esa fecha."
                    : "Ningun articulo coincide con la busqueda."}
                </td>
              </tr>
            )}
            {visibles.map((row) => (
              <tr
                key={`${row.articuloTipo}:${row.articuloId}`}
                className="border-t border-neutral-100 transition-colors hover:bg-neutral-50"
              >
                <td className="px-3 py-2.5">{row.articuloNombre}</td>
                <td className="px-3 py-2.5">
                  {row.articuloTipo === "subreceta" ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                      Subreceta
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">Producto</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-neutral-400">{row.unitLabel}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">
                  {cantidad(row.base)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    row.movimientos < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {row.movimientos > 0 ? "+" : ""}
                  {cantidad(row.movimientos)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                    row.saldo < 0 ? "text-red-600" : "text-neutral-900"
                  }`}
                >
                  {cantidad(row.saldo)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">
                  {row.unitCost === 0 ? (
                    <span className="text-neutral-300" title="Esta sucursal no tiene con que costearlo">
                      sin costo
                    </span>
                  ) : (
                    formatMoney(row.unitCost, 4)
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.valor)}</td>
              </tr>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot className="sticky bottom-0 border-t border-neutral-200 bg-neutral-50 font-medium">
              <tr>
                <td colSpan={7} className="px-3 py-3 text-right text-neutral-500">
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(totalValor)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
