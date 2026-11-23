"use client";

import { useActionState, useState } from "react";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { addCosteadorItem } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";

type Option = { id: string; name: string; baseUnit?: UnitValue; yieldUnit?: UnitValue };

const initialState: { error?: string } = {};

export default function AgregarIngrediente({
  costeadorId,
  productos,
  subrecetas,
}: {
  costeadorId: string;
  productos: Option[];
  subrecetas: Option[];
}) {
  const [state, formAction, pending] = useActionState(
    addCosteadorItem.bind(null, costeadorId),
    initialState,
  );
  const [tipo, setTipo] = useState<"product" | "subrecipe">("product");
  const [productId, setProductId] = useState("");
  const [subRecipeId, setSubRecipeId] = useState("");
  const [unit, setUnit] = useState<UnitValue>("G");

  // La unidad ya registrada manda el tipo de magnitud: nadie debe poder capturar piezas de algo
  // que se compra en kilos.
  const unidadRegistrada =
    tipo === "product"
      ? productos.find((p) => p.id === productId)?.baseUnit
      : subrecetas.find((r) => r.id === subRecipeId)?.yieldUnit;

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm font-medium text-neutral-700">Agregar ingrediente</p>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="componentType"
            value="product"
            checked={tipo === "product"}
            onChange={() => {
              setTipo("product");
              setSubRecipeId("");
            }}
            disabled={productos.length === 0}
          />
          Producto
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="componentType"
            value="subrecipe"
            checked={tipo === "subrecipe"}
            onChange={() => {
              setTipo("subrecipe");
              setProductId("");
            }}
            disabled={subrecetas.length === 0}
          />
          Subreceta
        </label>
      </div>

      {tipo === "product" ? (
        <SearchableSelect
          name="productId"
          options={productos.map((p) => ({ id: p.id, label: p.name }))}
          value={productId}
          onChange={(id) => {
            setProductId(id);
            const p = productos.find((x) => x.id === id);
            if (p?.baseUnit) setUnit(p.baseUnit);
          }}
          placeholder="Buscar producto..."
        />
      ) : (
        <SearchableSelect
          name="subRecipeId"
          options={subrecetas.map((r) => ({ id: r.id, label: r.name }))}
          value={subRecipeId}
          onChange={(id) => {
            setSubRecipeId(id);
            const r = subrecetas.find((x) => x.id === id);
            if (r?.yieldUnit) setUnit(r.yieldUnit);
          }}
          placeholder="Buscar subreceta..."
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          name="quantity"
          type="number"
          step="any"
          min="0"
          required
          placeholder="Cantidad"
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        />
        <select
          name="unit"
          required
          value={unit}
          onChange={(e) => setUnit(e.target.value as UnitValue)}
          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
        >
          {UNITS.map((u) => (
            <option
              key={u}
              value={u}
              disabled={!!unidadRegistrada && UNIT_META[u].type !== UNIT_META[unidadRegistrada].type}
            >
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || (productos.length === 0 && subrecetas.length === 0)}
        className="rounded-md bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Agregando..." : "Agregar"}
      </button>
    </form>
  );
}
