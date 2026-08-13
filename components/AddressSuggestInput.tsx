"use client";

import { useEffect, useRef, useState } from "react";

export type AddressSuggestion = { id: string; placeName: string; lat: number; lng: number };

/**
 * Input de direccion con autocompletado: mientras el usuario escribe, muestra un menu desplegable
 * de ubicaciones sugeridas (via Mapbox) para que las elija en vez de tener que escribir la
 * direccion completa y exacta. Al elegir una, ya trae lat/lng listos (no hace falta geocodificar
 * el texto de nuevo).
 */
export default function AddressSuggestInput({
  id,
  name,
  value,
  onChange,
  onSelect,
  suggestFn,
  placeholder,
  className,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  suggestFn: (query: string) => Promise<AddressSuggestion[]>;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const results = await suggestFn(value);
      if (!cancelled) {
        setSuggestions(results);
        setOpen(results.length > 0);
        setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className ?? "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"}
      />
      {loading && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
          Buscando...
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {s.placeName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
