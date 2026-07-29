"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ComboOption = { id: string; label: string };

export default function SearchableSelect({
  name,
  options,
  value,
  onChange,
  placeholder = "Buscar...",
}: {
  name: string;
  options: ComboOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-max min-w-full max-w-xs overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-neutral-400">Sin resultados</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`block w-full overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                  o.id === value ? "bg-neutral-100 font-medium" : ""
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
