"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/input";

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar",
  className,
  autoFocus,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange"> & { value: string; onChange: (value: string) => void }) {
  return (
    <span className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(inputClass, "pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden")}
        {...props}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-3 hover:bg-accent-soft hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}
