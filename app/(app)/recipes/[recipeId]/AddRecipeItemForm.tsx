"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { UNITS, UNIT_LABELS, UNIT_META, type UnitValue } from "@/lib/units";
import { addRecipeItem } from "../actions";
import SearchableSelect from "../../_components/SearchableSelect";

type Option = { id: string; name: string; baseUnit?: UnitValue; yieldUnit?: UnitValue };

const initialState: { error?: string } = {};

export default function AddRecipeItemForm({
  recipeId,
  recipeYieldQty,
  recipeYieldUnit,
  products,
  subRecipeOptions,
}: {
  recipeId: string;
  recipeYieldQty: string;
  recipeYieldUnit: UnitValue;
  products: Option[];
  subRecipeOptions: Option[];
}) {
  const boundAction = addRecipeItem.bind(null, recipeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [componentType, setComponentType] = useState<"product" | "subrecipe">("product");

  const hasProducts = products.length > 0;
  const hasSubRecipes = subRecipeOptions.length > 0;

  const [productId, setProductId] = useState("");
  const [subRecipeId, setSubRecipeId] = useState("");
  const [unit, setUnit] = useState<UnitValue>("G");

  function handleComponentTypeChange(type: "product" | "subrecipe") {
    setComponentType(type);
    setProductId("");
    setSubRecipeId("");
  }

  function handleProductChange(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    if (product?.baseUnit) setUnit(product.baseUnit);
  }

  function handleSubRecipeChange(id: string) {
    setSubRecipeId(id);
    const subRecipe = subRecipeOptions.find((r) => r.id === id);
    if (subRecipe?.yieldUnit) setUnit(subRecipe.yieldUnit);
  }

  // Restringe la unidad capturable al tipo (masa/volumen/pieza) de la unidad ya registrada en el
  // producto o subreceta elegida, para evitar capturar ej. "PZA" de un producto medido en KG.
  const registeredUnit =
    componentType === "product"
      ? products.find((p) => p.id === productId)?.baseUnit
      : subRecipeOptions.find((r) => r.id === subRecipeId)?.yieldUnit;

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-700">Agregar ingrediente</p>
        <p className="text-xs text-neutral-500">
          Rendimiento de la receta: {recipeYieldQty} {UNIT_LABELS[recipeYieldUnit]}
        </p>
      </div>

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="componentType"
            value="product"
            checked={componentType === "product"}
            onChange={() => handleComponentTypeChange("product")}
            disabled={!hasProducts}
          />
          Producto
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="componentType"
            value="subrecipe"
            checked={componentType === "subrecipe"}
            onChange={() => handleComponentTypeChange("subrecipe")}
            disabled={!hasSubRecipes}
          />
          Subreceta
        </label>
      </div>

      {componentType === "product" ? (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchableSelect
              name="productId"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              value={productId}
              onChange={handleProductChange}
              placeholder="Buscar ingrediente..."
            />
          </div>
          {productId && (
            <Link
              href={`/products/${productId}/edit`}
              target="_blank"
              className="shrink-0 text-sm text-neutral-500 hover:text-neutral-900 hover:underline"
              title="Editar este producto en el catalogo"
            >
              Editar producto ↗
            </Link>
          )}
        </div>
      ) : (
        <SearchableSelect
          name="subRecipeId"
          options={subRecipeOptions.map((r) => ({ id: r.id, label: r.name }))}
          value={subRecipeId}
          onChange={handleSubRecipeChange}
          placeholder="Buscar ingrediente..."
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
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="unit"
          required
          value={unit}
          onChange={(e) => setUnit(e.target.value as UnitValue)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {UNITS.map((u) => (
            <option
              key={u}
              value={u}
              disabled={!!registeredUnit && UNIT_META[u].type !== UNIT_META[registeredUnit].type}
            >
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || (!hasProducts && !hasSubRecipes)}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Agregando..." : "Agregar"}
      </button>
    </form>
  );
}
