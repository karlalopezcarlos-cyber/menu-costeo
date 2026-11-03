"use client";

import { useState } from "react";
import { TASAS_IVA_COMUNES } from "@/lib/taxes";

/**
 * IVA e IEPS del producto, compartidos por el alta y la edicion.
 *
 * Los dos arrancan en 0 y se prenden donde aplica. En un restaurante casi todo el almacen es
 * alimento sin procesar, que va en tasa 0: con el default en 16 habria que entrar a corregir
 * casi todos los productos, y el que se escape queda cobrando un IVA que su factura no trae.
 * Ninguno de los dos toca el costo: el precio de compra se captura sin impuesto y el IVA es
 * acreditable.
 */
export default function TaxFields({
  ivaRate = "0",
  iepsRate = "0",
}: {
  ivaRate?: string;
  iepsRate?: string;
}) {
  // El IEPS empieza escondido: pedirselo a los 400 productos que no lo causan es ruido. Se
  // abre solo, sin tener que picarle, cuando el producto ya trae una tasa capturada.
  const [showIeps, setShowIeps] = useState(Number(iepsRate) > 0);

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-700">Impuestos</p>

      <div className="space-y-1">
        <label htmlFor="ivaRate" className="text-sm text-neutral-700">
          IVA (%)
        </label>
        <input
          id="ivaRate"
          name="ivaRate"
          type="number"
          step="any"
          min="0"
          max="100"
          defaultValue={ivaRate}
          list="tasas-iva"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <datalist id="tasas-iva">
          {TASAS_IVA_COMUNES.map((tasa) => (
            <option key={tasa} value={tasa} />
          ))}
        </datalist>
        <p className="text-xs text-neutral-500">
          Arranca en 0 porque los alimentos sin procesar no lo causan. Ponle 16 a lo que si lo
          trae en la factura —abarrotes procesados, bebidas, desechables— y las compras nuevas de
          este producto lo toman solo. No afecta el costo —el precio se captura sin impuesto y el
          IVA es acreditable—, sirve para cuadrar contra la factura y para saber cuanto se le paga
          al proveedor.
        </p>
      </div>

      {showIeps ? (
        <div className="space-y-1">
          <label htmlFor="iepsRate" className="text-sm text-neutral-700">
            IEPS (%)
          </label>
          <input
            id="iepsRate"
            name="iepsRate"
            type="number"
            step="any"
            min="0"
            max="100"
            defaultValue={iepsRate}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
          <p className="text-xs text-neutral-500">
            Solo para lo que lo causa: cerveza 26.5%, vinos 30%, destilados 53%. Se calcula sobre
            el precio y el IVA se cobra encima del precio ya con IEPS, como en la factura. Dejalo
            en 0 si no aplica.
          </p>
        </div>
      ) : (
        <>
          <input type="hidden" name="iepsRate" value="0" />
          <button
            type="button"
            onClick={() => setShowIeps(true)}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            + Agregar IEPS
          </button>
        </>
      )}
    </div>
  );
}
