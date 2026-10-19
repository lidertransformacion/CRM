"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Chip de filtro conmutable (varios pueden estar activos). `alert` lo pinta en rojo suave. */
export function Chip({
  active,
  alert,
  count,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean; alert?: boolean; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-navy bg-navy text-crema" : alert ? "border-[#f0b4b4] bg-danger-soft text-danger hover:bg-[#f8d9d9]" : "border-line bg-surface text-ink-2 hover:border-[rgba(24,43,85,.3)] hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {count != null && <span className={cn("num rounded-full px-1.5 text-[11px] leading-4", active ? "bg-white/15" : "bg-accent-soft")}>{count}</span>}
    </button>
  );
}
