"use client";

import { useState } from "react";
import { copyIngredientsFromSource } from "../actions";

export default function CopyIngredientsButton({ recipeId }: { recipeId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <p className="text-sm text-neutral-600">
        Esta receta es una copia de la sucursal principal y todavia no tiene ingredientes. Puedes
        capturarlos aqui a mano, o traer de una vez los que ya tenga la receta principal.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await copyIngredientsFromSource(recipeId);
          setPending(false);
          if (result?.error) setError(result.error);
        }}
        className="mt-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        {pending ? "Copiando..." : "Copiar ingredientes desde la sucursal principal"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
