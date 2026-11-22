"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { TASAS_IVA_COMUNES } from "@/lib/taxes";
import { setInternalPrice } from "../actions";
import { setClaveProdServ } from "../../settings/fiscal/actions";

export type PrecioRow = {
  tipo: "product" | "recipe";
  id: string;
  nombre: string;
  unidad: string;
  /** Lo que le cuesta a esta sucursal. Null cuando no se puede costear todavia. */
  costo: number | null;
  /** Precio de traspaso vigente, SIN IVA. Null = se traspasa a costo. */
  precio: number | null;
  /** Tasa de IVA en por ciento. 0 = sin IVA. */
  ivaRate: number;
  /** Clave c_ClaveProdServ del SAT. Null = todavia no se puede facturar este renglon. */
  claveProdServ: string | null;
  /** Clave c_ClaveUnidad, deducida de la unidad. Solo se muestra. */
  claveUnidad: string;
};

/** Un renglon que se guarda solo al salir del campo, como la captura de costos por sucursal. */
function Renglon({ row }: { row: PrecioRow }) {
  const router = useRouter();
  const [valor, setValor] = useState(row.precio !== null ? String(row.precio) : "");
  const [tasa, setTasa] = useState(row.ivaRate);
  const [clave, setClave] = useState(row.claveProdServ ?? "");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, startGuardado] = useTransition();

  const original = row.precio !== null ? String(row.precio) : "";

  function guardar(nuevaTasa: number = tasa) {
    // La tasa sola no se guarda si no hay precio: sin precio no hay venta interna que gravar.
    if (valor.trim() === original && nuevaTasa === row.ivaRate) return;
    if (valor.trim() === "" && original === "") return;
    setError(null);
    setGuardado(false);
    startGuardado(async () => {
      const resultado = await setInternalPrice(row.tipo, row.id, valor, nuevaTasa);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      router.refresh();
    });
  }

  function guardarClave() {
    if (clave.trim() === (row.claveProdServ ?? "")) return;
    setErrorClave(null);
    startGuardado(async () => {
      const resultado = await setClaveProdServ(row.tipo, row.id, clave);
      if (resultado?.error) {
        setErrorClave(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  const precioNum = Number(valor.replace(/,/g, ""));
  const hayPrecio = valor.trim() !== "" && !Number.isNaN(precioNum) && precioNum > 0;
  const margen = hayPrecio && row.costo !== null ? precioNum - row.costo : null;
  const conIva = hayPrecio ? precioNum * (1 + tasa / 100) : null;

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
          onBlur={() => guardar()}
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
      <td className="px-4 py-2.5 text-right">
        <select
          value={tasa}
          onChange={(e) => {
            const nueva = Number(e.target.value);
            setTasa(nueva);
            guardar(nueva);
          }}
          disabled={guardando || !hayPrecio}
          aria-label={`IVA de ${row.nombre}`}
          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm disabled:text-neutral-300"
        >
          {TASAS_IVA_COMUNES.map((t) => (
            <option key={t} value={t}>
              {t === 0 ? "Sin IVA" : `${t}%`}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5 text-right text-neutral-600">
        {conIva === null ? <span className="text-neutral-300">—</span> : formatMoney(conIva, 4)}
      </td>
      <td
        className={`px-4 py-2.5 text-right ${
          margen === null ? "text-neutral-300" : margen < 0 ? "text-red-600" : "text-neutral-600"
        }`}
      >
        {margen === null ? "—" : formatMoney(margen, 4)}
      </td>
      <td className="px-4 py-2.5 text-right">
        <input
          type="text"
          inputMode="numeric"
          value={clave}
          onChange={(e) => {
            setClave(e.target.value);
            setErrorClave(null);
          }}
          onBlur={guardarClave}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={guardando}
          placeholder="8 digitos"
          aria-label={`Clave del SAT de ${row.nombre}`}
          title={`ClaveUnidad del SAT: ${row.claveUnidad}`}
          className={`w-28 rounded-md border px-2.5 py-1.5 text-right text-sm ${
            errorClave ? "border-red-300" : "border-neutral-200"
          }`}
        />
      </td>
      <td className="px-4 py-2.5 text-xs text-red-600">{error ?? errorClave}</td>
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
                Precio s/IVA
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                IVA
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Total c/IVA
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Ingreso por unidad
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em]">
                Clave SAT
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
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
        La <strong>Clave SAT</strong> es la ClaveProdServ que el SAT exige en cada concepto de
        una factura; sin ella ese renglon no se puede facturar. La ClaveUnidad no se captura:
        sale sola de la unidad (pasa el cursor sobre el campo para verla).
      </p>
      <p className="text-xs text-neutral-400">
        El precio se captura <strong>sin IVA</strong>, igual que el de una compra: el impuesto se
        suma aparte porque es acreditable y no es costo de nadie. Se guarda solo al salir del
        campo; dejarlo vacio borra el precio y ese renglon vuelve a traspasarse a costo. Cambiar
        un precio o una tasa no mueve las requisiciones ya hechas: cada traspaso se queda con lo
        que tenia el dia que se envio.
      </p>
    </div>
  );
}
