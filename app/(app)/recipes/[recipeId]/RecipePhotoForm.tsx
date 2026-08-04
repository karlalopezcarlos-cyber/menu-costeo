"use client";

import { useActionState, useRef, useState } from "react";
import { removeRecipePhoto, updateRecipePhoto } from "../actions";

const initialState: { error?: string } = {};

export default function RecipePhotoForm({
  recipeId,
  hasPhoto,
  updatedAt,
}: {
  recipeId: string;
  hasPhoto: boolean;
  updatedAt: number;
}) {
  const boundAction = updateRecipePhoto.bind(null, recipeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [removing, setRemoving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      {hasPhoto ? (
        <img
          src={`/api/recipes/${recipeId}/photo?v=${updatedAt}`}
          alt="Foto de la receta"
          className="h-28 w-28 rounded-lg border border-neutral-200 object-cover"
        />
      ) : (
        <div className="flex h-28 w-28 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-center text-xs text-neutral-400">
          Sin foto
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col items-center gap-1"
      >
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={() => formRef.current?.requestSubmit()}
          className="w-28 text-xs text-neutral-500 file:mr-1 file:rounded file:border-0 file:bg-neutral-100 file:px-2 file:py-1 file:text-xs"
        />
        {pending && <p className="text-xs text-neutral-500">Subiendo...</p>}
        {state?.error && <p className="max-w-28 text-center text-xs text-red-600">{state.error}</p>}
      </form>

      {hasPhoto && (
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true);
            await removeRecipePhoto(recipeId);
            setRemoving(false);
          }}
          className="text-xs text-neutral-400 hover:text-red-600 disabled:opacity-50"
        >
          {removing ? "Quitando..." : "Quitar foto"}
        </button>
      )}
    </div>
  );
}
