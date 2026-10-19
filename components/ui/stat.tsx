"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "text-ink",
  ok: "text-ok",
  warn: "text-hl-ink",
  danger: "text-danger",
  info: "text-info",
} as const;

/**
 * Tarjeta de indicador: etiqueta, número grande y una pista.
 * Con `href` es un enlace; con `onClick` es un botón (p. ej. para filtrar la lista de abajo);
 * `active` lo marca como filtro aplicado.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  href,
  onClick,
  active = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof tones;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const interactive = !!href || !!onClick;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        {icon ? (
          <span className="text-ink-3 [&_svg]:size-4">{icon}</span>
        ) : interactive ? (
          <ArrowUpRight className="size-4 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      <p className={cn("num mt-1 break-words text-[clamp(20px,2.2vw,26px)] font-semibold leading-none tracking-tight", tones[tone])}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
    </>
  );
  const base = cn(
    "group block w-full rounded-xl border bg-surface px-4 py-3.5 text-left shadow-card",
    active ? "border-navy ring-1 ring-navy" : "border-line-2",
    interactive && "transition-colors hover:border-line hover:bg-surface-2",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={base} aria-current={active ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} aria-pressed={active}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

const COLS = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 xl:grid-cols-4", 5: "md:grid-cols-3 xl:grid-cols-5", 6: "md:grid-cols-3 xl:grid-cols-6" } as const;

/** Rejilla de indicadores: 2 columnas en móvil y `cols` en escritorio (por defecto 5). */
export function StatGrid({ className, cols = 5, ...props }: React.ComponentProps<"div"> & { cols?: keyof typeof COLS }) {
  return <div className={cn("grid grid-cols-2 gap-3", COLS[cols], className)} {...props} />;
}
