"use client";

import { useState, useTransition } from "react";

export default function InlineNameEditor({
  id,
  initialName,
  action,
}: {
  id: string;
  initialName: string;
  action: (id: string, name: string) => Promise<{ error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      setValue(initialName);
      setEditing(false);
      setError(null);
      return;
    }
    startTransition(async () => {
      const result = await action(id, trimmed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left hover:underline"
        title="Editar nombre"
      >
        {initialName}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(initialName);
              setEditing(false);
              setError(null);
            }
          }}
          className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-sm font-medium text-neutral-700 hover:text-neutral-900 disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(initialName);
            setEditing(false);
            setError(null);
          }}
          className="text-sm text-neutral-400 hover:text-neutral-600"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
