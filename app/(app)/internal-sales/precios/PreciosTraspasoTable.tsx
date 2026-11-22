"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { setInternalPrice } from "../actions";

export type PrecioRow = {
  tipo: "product" | "recipe";
  id: string;
  nombre: string;
  unidad: string;
  /** Lo que le cuesta a esta sucursal. Null cuando no se puede costear todavia. */
  costo: number | null;
  /** Precio de traspaso vigente. Null = se traspasa a costo. */
  precio: number | null;
};

/** Un renglon que se guarda solo al salir del campo, como la captura de costos por sucursal. */
function Renglon({ row }: { row: PrecioRow }) {
  const router = useRouter();
  const [valor, setValor] = useState(row.precio !== null ? String(row.precio) : "");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, startGuardado] = useTransition();

  const original = row.precio !== null ? String(row.precio) : "";

  function guardar() {
    if (valor.trim() === original) return;
    setError(null);
    setGuardado(false);
    startGuardado(async () => {
      const resultado = await setInternalPrice(row.tipo, row.id, valor);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      router.refresh();
    });
  }

  const precioNum = Number(valor.replace(/,/g, ""));
  const hayPrecio = valor.trim() !== "" && !Number.isNaN(precioNum) && precioNum > 0;
  const margen = hayPrecio && row.costo !== null ? precioNum - row.costo : null;

  return (
    <tr className="border-t border-neutral-100">
      <td className="px-4 py-2.5">{row.nombre}</td>
      <td className="px-4 py-2.5 text-neutral-400">{row.unidad}</td>
      <td className="px-4 py-2.5 text-right text-neutral-500">
        {row.costo === null ? (
          <span className="text-neutral-300" title="Esta sucursal no tiene con que costearlo">
            sin costo
          </span>
        ) : (
          formatMoney(row.costo, 4)
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setGuardado(false);
          }}
          onBlur={guardar}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={guardando}
          placeholder="a costo"
          aria-label={`Precio de traspaso de ${row.nombre}`}
          className={`w-28 rounded-md border px-2.5 py-1.5 text-right text-sm transition-colors ${
            error
              ? "border-red-300"
              : guardado
                ? "border-emerald-300 bg-emerald-50"
                : "border-neutral-200"
          }`}
        />
      </td>
      <td
        className={`px-4 py-2.5 text-right ${
          margen === null ? "text-neutral-300" : margen < 0 ? "text-red-600" : "text-neutral-600"
        }`}
      >
        {margen === null ? "—" : formatMoney(margen, 4)}
      </td>
      <td className="px-4 py-2.5 text-xs text-red-600">{error}</td>
    </tr>
  );
}

export default function PreciosTraspasoTable({
  productos,
  subrecetas,
}: {
  productos: PrecioRow[];
  subrecetas: PrecioRow[];
}) {
  const [pestana, setPestana] = useState<"product" | "recipe">("product");
  const [busqueda, setBusqueda] = useState("");
  const [soloConPrecio, setSoloConPrecio] = useState(false);

  const base = pestana === "product" ? productos : subrecetas;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return base.filter((row) => {
      if (q && !row.nombre.toLowerCase().includes(q)) return false;
      if (soloConPrecio && row.precio === null) return false;
      return true;
    });
  }, [base, busqueda, soloConPrecio]);

  const conPrecio = base.filter((r) => r.precio !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-neutral-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setPestana("product")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              pestana === "product" ? "bg-neutral-900 text-white" : "text-neutral-600"
            }`}
          >
            Productos ({productos.filter((r) => r.precio !== null).length}/{productos.length})
          </button>
          <button
            type="button"
            onClick={() => setPestana("recipe")}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              pestana === "recipe" ? "bg-neutral-900 text-white" : "text-neutral-600"
            }`}
          >
            Subrecetas ({subrecetas.filter((r) => r.precio !== null).length}/{subrecetas.length})
          </button>
        </div>

        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar..."
          className="w-[14rem] rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />

        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={soloConPrecio}
            onChange={(e) => setSoloConPrecio(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Solo los que ya tienen precio
        </label>

        <p className="ml-auto text-sm text-neutral-500">
          {visibles.length} renglones · {conPrecio} con precio
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">
                {pestana === "product" ? "Producto" : "Subreceta"}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]">Unidad</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Costo aqui
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Precio de traspaso
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Ingreso por unidad
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  {base.length === 0
                    ? pestana === "product"
                      ? "No hay productos en el catalogo."
                      : "Esta sucursal no tiene subrecetas."
                    : "Nada coincide con la busqueda."}
                </td>
              </tr>
            )}
            {visibles.map((row) => (
              <Renglon key={`${row.tipo}-${row.id}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        El precio se guarda solo al salir del campo. Dejarlo vacio borra el precio y ese renglon
        vuelve a traspasarse a costo. Cambiar un precio no mueve las requisiciones ya hechas: cada
        traspaso se queda con el precio que tenia el dia que se envio.
      </p>
    </div>
  );
}
