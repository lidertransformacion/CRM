"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; count?: number; tone?: "danger" | "warn" | "ok" };

/** Control segmentado para alternar vistas o filtros excluyentes (máx. 5 opciones). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-line-2 bg-surface-2 p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(24,43,85,.12)]" : "text-ink-2 hover:text-ink",
            )}
          >
            {option.label}
            {option.count != null && (
              <span className={cn("num rounded-full px-1.5 text-[11px] leading-4", option.tone === "danger" ? "bg-danger-soft text-danger" : option.tone === "warn" ? "bg-warn-soft text-hl-ink" : option.tone === "ok" ? "bg-ok-soft text-ok" : "bg-accent-soft text-ink-2")}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
